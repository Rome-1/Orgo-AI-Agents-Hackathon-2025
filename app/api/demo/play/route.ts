import { type NextRequest, NextResponse } from "next/server"
import { getComputer } from '@/lib/orgo'

export const runtime = 'nodejs'

// In-memory conversation cache
type Conv = { 
  instruction: string; 
  running: boolean;
  provider: 'anthropic' | 'groq' | 'cerebras';
};
const conversations = new Map<string, Conv>();

export async function POST(request: NextRequest) {
  const { instruction, convId, delayMs = 1, provider = 'anthropic', disableDelays = false } = await request.json()
  
  if (!instruction) {
    return NextResponse.json({ error: "Instruction is required" }, { status: 400 })
  }

  // Generate or use existing conversation ID
  const id = convId ?? crypto.randomUUID()
  let conv = conversations.get(id)
  if (!conv) {
    conv = { 
      instruction, 
      running: false,
      provider: provider as 'anthropic' | 'groq'
    }
    conversations.set(id, conv)
  } else {
    // Update provider if provided
    conv.provider = provider as 'anthropic' | 'groq'
  }

  if (conv.running) {
    return NextResponse.json({ error: "Already running" }, { status: 409 })
  }

  conv.running = true

  // Create streaming response
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const computer = await getComputer()

        // Metrics tracking
                    const startTime = Date.now()
            let actionCount = 0
            const actionTypeMetrics: { [key: string]: { count: number, totalTime: number } } = {}
            const modelCallMetrics: { count: number, totalTime: number } = { count: 0, totalTime: 0 }
        
        // Helper function to take and send screenshot
        const sendScreenshot = async () => {
          try {
            console.log("Taking screenshot...")
            const screenshot = await computer.screenshotBase64()
            console.log("Screenshot taken, length:", screenshot?.length || 0)
            try {
              const eventData = { screenshot }
              console.log("Sending screenshot event with data length:", JSON.stringify(eventData).length)
              controller.enqueue(
                `event: screenshot\ndata:${JSON.stringify(eventData)}\n\n`
              )
              console.log("Screenshot event sent successfully")
            } catch (error) {
              console.log("Controller closed, cannot send screenshot:", error)
            }
          } catch (error) {
            console.error("Failed to take screenshot:", error)
          }
        }

        // Send initial screenshot
        await sendScreenshot()
        actionCount++ // Count initial screenshot

        // Create progress callback for streaming events
        const progressCallback = async (eventType: string, eventData: any) => {
          console.log(`Play callback: ${eventType}`, eventData)
          
          // Track action count for all meaningful events
          if (eventType === 'tool_use' || eventType === 'screenshot' || eventType === 'text' || eventType === 'thinking') {
            actionCount++
          }
          
          // Track action type metrics
          if (eventType === 'tool_use' && eventData.input?.action) {
            const actionType = eventData.input.action
            if (!actionTypeMetrics[actionType]) {
              actionTypeMetrics[actionType] = { count: 0, totalTime: 0 }
            }
            actionTypeMetrics[actionType].count++
          }
          
          try {
            controller.enqueue(
              `event: ${eventType}\ndata:${JSON.stringify(eventData)}\n\n`
            )
          } catch (error) {
            console.log("Controller already closed, skipping event:", eventType)
            return
          }
          
          // Take screenshot after any action that changes the screen
          if (eventType === 'tool_use' || eventType === 'thinking') {
            console.log(`Taking screenshot after ${eventType} with delay ${delayMs}ms`)
            // Use a more reliable delay mechanism (only if delays are enabled)
            if (!disableDelays) {
              await new Promise(resolve => setTimeout(resolve, delayMs))
            }
            try {
              await sendScreenshot()
            } catch (error) {
              console.log("Failed to send screenshot after delay:", error instanceof Error ? error.message : String(error))
            }
          }
        }

        // Execute the instruction based on provider
        console.log(`Executing play with provider: ${conv!.provider}`)
        
        if (conv!.provider === 'anthropic') {
          // Use Orgo's computer.prompt() for Anthropic
          const modelCallStart = Date.now()
          await computer.prompt({ 
            instruction: conv!.instruction,
            callback: progressCallback,
            maxIterations: 10,
            maxTokens: 4096
          })
          const modelCallEnd = Date.now()
          modelCallMetrics.count++
          modelCallMetrics.totalTime += (modelCallEnd - modelCallStart)
        } else if (conv!.provider === 'groq') {
          // Use Groq with structured output (JSON schema) instead of tool calls
          const Groq = require('groq-sdk')
          const client = new Groq()
          const { computerActionSchema, execTool } = await import('@/lib/tools')
          
          const messages: any[] = [
            {
              role: "system",
              content: "You are a computer automation assistant. You control a remote desktop (1024x768 pixels) and can perform actions like clicking, typing, scrolling, taking screenshots, and waiting. Always respond with a JSON object containing an 'actions' array and optional 'reasoning' string. Each action should have an 'action' field (screenshot, left_click, right_click, double_click, type, key, scroll, wait) and appropriate parameters (coordinate array for clicks, text for typing, key for key presses, etc.). Always pass numeric values (not strings) for duration and scroll_amount. IMPORTANT: When using the 'key' action, use the 'key' field (not 'text') and press only ONE key at a time (e.g., 'a', 'enter', 'space'). Do NOT use shortcuts like 'ctrl+c', 'command+w', or 'alt+tab' - these are not supported. Coordinate clicks within the 1024x768 display area."
            },
            { role: "user", content: conv!.instruction }
          ]
          
          let iterations = 0
          const maxIterations = 10
          
          while (iterations < maxIterations) {
            const modelCallStart = Date.now()
            const response = await client.chat.completions.create({
              model: "llama-3.3-70b-versatile",
              messages,
            response_format: {
              type: "json_object"
            },
              max_tokens: 4096,
              stream: false
            })
            const modelCallEnd = Date.now()
            modelCallMetrics.count++
            modelCallMetrics.totalTime += (modelCallEnd - modelCallStart)
            
            const assistantMsg = response.choices[0].message
            
            // Push assistant message to history
            messages.push(assistantMsg)
            
            // Parse the structured output
            let actionData
            try {
              actionData = JSON.parse(assistantMsg.content || "{}")
              console.log("Parsed Groq response:", JSON.stringify(actionData, null, 2))
            } catch (parseError) {
              console.error("Failed to parse Groq response:", assistantMsg.content)
              console.error("Parse error:", parseError)
              break
            }
            
            // No actions → agent is done
            if (!actionData.actions || actionData.actions.length === 0) {
              console.log("No actions found in Groq response, ending execution")
              break
            }
            
            console.log(`Executing ${actionData.actions.length} actions from Groq`)
            
            // Execute each action
            for (const action of actionData.actions) {
              try {
                console.log("Executing action:", JSON.stringify(action, null, 2))
                
                // Send tool_use event
                controller.enqueue(
                  `event: tool_use\ndata:${JSON.stringify({ 
                    type: "tool_use",
                    input: action 
                  })}\n\n`
                )
                
                // Execute the action
                const result = await execTool(computer, action)
                
                // Send tool_result event
                controller.enqueue(
                  `event: tool_result\ndata:${JSON.stringify(result)}\n\n`
                )
                
                // Add reasoning if provided
                if (actionData.reasoning) {
                  controller.enqueue(
                    `event: text\ndata:${JSON.stringify({ text: actionData.reasoning })}\n\n`
                  )
                }
                
                // Take screenshot after action
                await sendScreenshot()
                
                // Add delay between actions (only if delays are enabled)
                if (!disableDelays) {
                  await new Promise(resolve => setTimeout(resolve, delayMs))
                }
                
              } catch (error) {
                console.error("Error processing action:", error)
                // Continue with next action instead of breaking
              }
            }
            
            // Add the results to the conversation for context
            messages.push({
              role: "user",
              content: `Actions completed: ${actionData.actions.map((a: any) => a.action).join(', ')}. Continue with the next steps if needed.`
            })
            
            iterations++
          }
        } else if (conv!.provider === 'cerebras') {
          // Use Cerebras with tool calling support
          const Cerebras = require('@cerebras/cerebras_cloud_sdk')
          const client = new Cerebras({
            apiKey: process.env.CEREBRAS_API_KEY
          })
          const { cerebrasComputerTool, execTool } = await import('@/lib/tools')
          
          const messages: any[] = [
            {
              role: "system",
              content: "You are a computer automation assistant. You control a remote desktop (1024x768 pixels) through the computer_action function. Always pass numeric values (not strings) for duration and scroll_amount. Use the computer_action function to perform tasks on the desktop. IMPORTANT: When using the 'key' action, press only ONE key at a time (e.g., 'a', 'enter', 'space'). Do NOT use shortcuts like 'ctrl+c', 'command+w', or 'alt+tab' - these are not supported. Coordinate clicks within the 1024x768 display area."
            },
            { role: "user", content: conv!.instruction }
          ]
          
          let iterations = 0
          const maxIterations = 10
          
          while (iterations < maxIterations) {
            const modelCallStart = Date.now()
            const response = await client.chat.completions.create({
              model: "llama-4-maverick-17b-128e-instruct", //"qwen-3-235b-a22b-instruct-2507",
              messages,
              tools: [cerebrasComputerTool],
              parallel_tool_calls: false,
              max_tokens: 4096,
              stream: false
            })
            const modelCallEnd = Date.now()
            modelCallMetrics.count++
            modelCallMetrics.totalTime += (modelCallEnd - modelCallStart)
            
            const assistantMsg = response.choices[0].message
            
            // Push assistant message to history
            messages.push(assistantMsg)
            
            // No tool calls → agent is done
            if (!assistantMsg.tool_calls?.length) {
              break
            }
            
            // Execute each tool call and push result back
            for (const call of assistantMsg.tool_calls) {
              try {
                // Parse the function arguments
                let args
                try {
                  args = JSON.parse(call.function.arguments)
                } catch (parseError) {
                  console.error("Failed to parse tool call arguments:", call.function.arguments)
                  continue
                }
                
                // Send tool_use event
                controller.enqueue(
                  `event: tool_use\ndata:${JSON.stringify({ 
                    type: "tool_use",
                    input: args 
                  })}\n\n`
                )
                
                // Execute the tool
                const result = await execTool(computer, args)
                
                // Send tool_result event
                controller.enqueue(
                  `event: tool_result\ndata:${JSON.stringify(result)}\n\n`
                )
                
                // Push tool result to message history
                messages.push({
                  role: "tool",
                  name: call.function.name,
                  content: JSON.stringify(result),
                  tool_call_id: call.id
                })
                
                // Take screenshot after action
                await sendScreenshot()
                
                // Add delay between actions (only if delays are enabled)
                if (!disableDelays) {
                  await new Promise(resolve => setTimeout(resolve, delayMs))
                }
                
              } catch (error) {
                console.error("Error processing tool call:", error)
                // Continue with next tool call instead of breaking
              }
            }
            
            iterations++
          }
        }

        // Take final screenshot before completion
        await sendScreenshot()
        actionCount++ // Count final screenshot

        // Calculate metrics
        const endTime = Date.now()
        const totalTime = endTime - startTime
        const actionsPerSecond = actionCount > 0 ? (actionCount / (totalTime / 1000)).toFixed(2) : '0.00'
        
        // Calculate detailed metrics
        const avgModelCallTime = modelCallMetrics.count > 0 ? (modelCallMetrics.totalTime / modelCallMetrics.count).toFixed(2) : '0.00'
        const actionTypeBreakdown = Object.entries(actionTypeMetrics).map(([type, metrics]) => ({
          type,
          count: metrics.count,
          avgTime: metrics.count > 0 ? (metrics.totalTime / metrics.count).toFixed(2) : '0.00'
        }))

        // Send completion event with metrics
        controller.enqueue(
          `event: complete\ndata:${JSON.stringify({ 
            message: "Task completed",
            metrics: {
              totalTime: totalTime,
              actionCount: actionCount,
              actionsPerSecond: actionsPerSecond,
              provider: conv!.provider,
              modelCallMetrics: {
                count: modelCallMetrics.count,
                totalTime: modelCallMetrics.totalTime,
                avgTime: avgModelCallTime
              },
              actionTypeBreakdown: actionTypeBreakdown
            }
          })}\n\n`
        )

      } catch (error) {
        console.error("Play error:", error)
        controller.enqueue(
          `event: error\ndata:${JSON.stringify({ error: String(error) })}\n\n`
        )
      } finally {
        conv!.running = false
        controller.close()
      }
    }
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'x-conversation-id': id
    }
  })
}

// Keep the GET method for backward compatibility
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const speed = searchParams.get("speed") || "50"

  try {
    console.log(`Playing demo at speed: ${speed}`)

    return NextResponse.json({
      success: true,
      message: `Demo playing at speed ${speed}`,
      speed: Number.parseInt(speed),
    })
  } catch (error) {
    console.error("Error playing demo:", error)
    return NextResponse.json({ error: "Failed to play demo" }, { status: 500 })
  }
}