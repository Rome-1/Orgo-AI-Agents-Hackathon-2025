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
        // Start timing the Orgo instantiation
        const orgoStartTime = Date.now()
        const computer = await getComputer()
        const orgoEndTime = Date.now()
        
        // Metrics tracking
        const startTime = Date.now()
        let actionCount = 0
        const actionTypeMetrics: { [key: string]: { count: number, totalTime: number } } = {}
        const modelCallMetrics: { count: number, totalTime: 0 } = { count: 0, totalTime: 0 }
        
        // Waterfall timing tracking
        const waterfall = {
          apiServerHit: startTime,
          orgoInstantiation: orgoEndTime,
          modelCallStart: 0,
          modelCallEnd: 0,
          toolCallStart: 0,
          toolCallEnd: 0,
          actionExecution: 0
        }
            
            const toolCalls: Array<{
              type: string
              startTime: number
              endTime: number
              duration: number
              success: boolean
              error?: string
            }> = []
            
            const modelCalls: Array<{
              startTime: number
              endTime: number
              duration: number
              tokensUsed?: number
            }> = []
        
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
          
          if (eventType === 'tool_use') {
            // Start tool-specific timer
            const toolStartTime = Date.now()
            
            // Count this as an action
            actionCount++
            
            // Track action type metrics
            const actionType = eventData.input?.action
            if (actionType) {
              if (!actionTypeMetrics[actionType]) {
                actionTypeMetrics[actionType] = { count: 0, totalTime: 0 }
              }
              actionTypeMetrics[actionType].count++
            }
            
            // Add tool call to detailed tracking
            toolCalls.push({
              type: actionType || 'unknown',
              startTime: toolStartTime,
              endTime: 0, // Will be updated when tool completes
              duration: 0,
              success: false // Will be updated when tool completes
            })
            
            try {
              controller.enqueue(
                `event: ${eventType}\ndata:${JSON.stringify(eventData)}\n\n`
              )
            } catch (error) {
              console.log("Controller already closed, skipping event:", eventType)
              return
            }
            
            // Take screenshot after tool use
            console.log(`Taking screenshot after ${eventType} with delay ${delayMs}ms`)
            if (!disableDelays) {
              await new Promise(resolve => setTimeout(resolve, delayMs))
            }
            try {
              await sendScreenshot()
            } catch (error) {
              console.log("Failed to send screenshot after delay:", error instanceof Error ? error.message : String(error))
            }
          } else {
            // Handle other event types (screenshot, text, thinking, error)
            // Don't count these as actions - only tool_use counts
            
            // Handle error events - update the last tool call as failed
            if (eventType === 'error') {
              const lastToolCall = toolCalls[toolCalls.length - 1]
              if (lastToolCall) {
                lastToolCall.endTime = Date.now()
                lastToolCall.duration = lastToolCall.endTime - lastToolCall.startTime
                lastToolCall.success = false
                lastToolCall.error = String(eventData.error || eventData)
              }
            }
            
            try {
              controller.enqueue(
                `event: ${eventType}\ndata:${JSON.stringify(eventData)}\n\n`
              )
            } catch (error) {
              console.log("Controller already closed, skipping event:", eventType)
              return
            }
            
            // Take screenshot after thinking events
            if (eventType === 'thinking') {
              console.log(`Taking screenshot after ${eventType} with delay ${delayMs}ms`)
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
        }

        // Execute the instruction based on provider
        console.log(`Executing play with provider: ${conv!.provider}`)
        
        if (conv!.provider === 'anthropic') {
          // Use Orgo's computer.prompt() for Anthropic
          waterfall.modelCallStart = Date.now()
          modelCalls.push({
            startTime: waterfall.modelCallStart,
            endTime: 0,
            duration: 0
          })
          
          await computer.prompt({ 
            instruction: conv!.instruction,
            callback: progressCallback,
            maxIterations: 10,
            maxTokens: 4096
          })
          
          waterfall.modelCallEnd = Date.now()
          const lastModelCall = modelCalls[modelCalls.length - 1]
          lastModelCall.endTime = waterfall.modelCallEnd
          lastModelCall.duration = waterfall.modelCallEnd - waterfall.modelCallStart
          
          modelCallMetrics.count++
          modelCallMetrics.totalTime += lastModelCall.duration
        } else if (conv!.provider === 'groq') {
          // Use Groq with structured output (JSON schema) instead of tool calls
          const Groq = require('groq-sdk')
          const client = new Groq()
          const { computerActionSchema, execTool } = await import('@/lib/tools')
          
          const messages: any[] = [
            {
              role: "system",
              content: "You are a computer automation assistant controlling an Ubuntu 22.04 LTS desktop (1024x768 pixels). You can perform actions like clicking, typing, scrolling, taking screenshots, and waiting. Always respond with a JSON object containing an 'actions' array. Each action should have an 'action' field (screenshot, left_click, right_click, double_click, type, key, scroll, wait) and appropriate parameters (coordinate array for clicks, text for typing, key for key presses, etc.). Always pass numeric values (not strings) for duration and scroll_amount. IMPORTANT: For Ubuntu shortcuts, use the full shortcut as a single key (e.g., 'ctrl+c', 'ctrl+v', 'ctrl+x', 'ctrl+z', 'ctrl+w') - do NOT send separate key presses for 'ctrl' and the letter. Coordinate clicks within the 1024x768 display area. Use double_click to open applications and files. CRITICAL: WAITING IS NOT AN OPTION. You must take proactive actions to complete the task. Do not just wait or take screenshots - actually DO something to accomplish the goal. Be aggressive and take multiple actions per response. If you see a terminal, type commands. If you see an application, interact with it. If you see text, type it. ALWAYS TAKE ACTION."
            },
            { role: "user", content: conv!.instruction }
          ]
          
          let iterations = 0
          const maxIterations = 10
          
          while (iterations < maxIterations) {
            waterfall.modelCallStart = Date.now()
            modelCalls.push({
              startTime: waterfall.modelCallStart,
              endTime: 0,
              duration: 0
            })
            
            const response = await client.chat.completions.create({
              model: "llama-3.3-70b-versatile",
              messages,
            response_format: {
              type: "json_object"
            },
              max_tokens: 4096,
              stream: false
            })
            
            waterfall.modelCallEnd = Date.now()
            const lastModelCall = modelCalls[modelCalls.length - 1]
            lastModelCall.endTime = waterfall.modelCallEnd
            lastModelCall.duration = waterfall.modelCallEnd - waterfall.modelCallStart
            
            modelCallMetrics.count++
            modelCallMetrics.totalTime += lastModelCall.duration
            
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
            
            // Execute each action in the response
            const responseStartTime = Date.now()
            let actionsExecuted = 0
            
            for (const action of actionData.actions) {
              try {
                console.log("Executing action:", JSON.stringify(action, null, 2))
                
                const actionStartTime = Date.now()
                
                // Execute the action
                const result = await execTool(computer, action)
                
                const actionEndTime = Date.now()
                actionsExecuted++
                
                // Track individual action in detailed array
                toolCalls.push({
                  type: action.action,
                  startTime: actionStartTime,
                  endTime: actionEndTime,
                  duration: actionEndTime - actionStartTime,
                  success: true
                })
                
                // Update action type metrics
                const actionType = action.action
                if (!actionTypeMetrics[actionType]) {
                  actionTypeMetrics[actionType] = { count: 0, totalTime: 0 }
                }
                actionTypeMetrics[actionType].count++
                actionTypeMetrics[actionType].totalTime += (actionEndTime - actionStartTime)
                
                // Take screenshot after action
                await sendScreenshot()
                
                // Add delay between actions (only if delays are enabled)
                if (!disableDelays) {
                  await new Promise(resolve => setTimeout(resolve, delayMs))
                }
                
              } catch (error) {
                console.error("Error processing action:", error)
                
                // Track failed tool call
                toolCalls.push({
                  type: action.action,
                  startTime: Date.now(),
                  endTime: Date.now(),
                  duration: 0,
                  success: false,
                  error: String(error)
                })
                
                // Continue with next action instead of breaking
              }
            }
            
            // Send single tool_use event for the entire response
            const responseEndTime = Date.now()
            waterfall.toolCallStart = responseStartTime
            waterfall.toolCallEnd = responseEndTime
            
            try {
              controller.enqueue(
                `event: tool_use\ndata:${JSON.stringify({ 
                  type: "tool_use",
                  input: actionData.actions,
                  actionsExecuted: actionsExecuted,
                  totalDuration: responseEndTime - responseStartTime
                })}\n\n`
              )
            } catch (enqueueError) {
              console.error("Failed to enqueue tool_use event:", enqueueError)
              // Don't throw - just continue
            }
            
            // Add reasoning if provided
            if (actionData.reasoning) {
              try {
                controller.enqueue(
                  `event: text\ndata:${JSON.stringify({ text: actionData.reasoning })}\n\n`
                )
              } catch (enqueueError) {
                console.error("Failed to enqueue text event:", enqueueError)
                // Don't throw - just continue
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
              content: "You are a computer automation assistant controlling an Ubuntu 22.04 LTS desktop (1024x768 pixels). You can perform actions like clicking, typing, scrolling, taking screenshots, and waiting. Always respond with a JSON object containing an 'actions' array. Each action should have an 'action' field (screenshot, left_click, right_click, double_click, type, key, scroll, wait) and appropriate parameters (coordinate array for clicks, text for typing, key for key presses, etc.). Always pass numeric values (not strings) for duration and scroll_amount. IMPORTANT: For Ubuntu shortcuts, use the full shortcut as a single key (e.g., 'ctrl+c', 'ctrl+v', 'ctrl+x', 'ctrl+z', 'ctrl+w') - do NOT send separate key presses for 'ctrl' and the letter. Coordinate clicks within the 1024x768 display area. Use double_click to open applications and files. CRITICAL: WAITING IS NOT AN OPTION. You must take proactive actions to complete the task. Do not just wait or take screenshots - actually DO something to accomplish the goal. Be aggressive and take multiple actions per response. If you see a terminal, type commands. If you see an application, interact with it. If you see text, type it. ALWAYS TAKE ACTION."
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
            const responseStartTime = Date.now()
            let actionsExecuted = 0
            
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
                
                const actionStartTime = Date.now()
                
                // Execute the tool
                const result = await execTool(computer, args)
                
                const actionEndTime = Date.now()
                actionsExecuted++
                
                // Track individual action in detailed array
                toolCalls.push({
                  type: args.action,
                  startTime: actionStartTime,
                  endTime: actionEndTime,
                  duration: actionEndTime - actionStartTime,
                  success: true
                })
                
                // Update action type metrics
                const actionType = args.action
                if (!actionTypeMetrics[actionType]) {
                  actionTypeMetrics[actionType] = { count: 0, totalTime: 0 }
                }
                actionTypeMetrics[actionType].count++
                actionTypeMetrics[actionType].totalTime += (actionEndTime - actionStartTime)
                
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
                
                // Track failed tool call
                toolCalls.push({
                  type: 'unknown',
                  startTime: Date.now(),
                  endTime: Date.now(),
                  duration: 0,
                  success: false,
                  error: String(error)
                })
                
                // Continue with next tool call instead of breaking
              }
            }
            
            // Send single tool_use event for the entire response
            const responseEndTime = Date.now()
            waterfall.toolCallStart = responseStartTime
            waterfall.toolCallEnd = responseEndTime
            
            controller.enqueue(
              `event: tool_use\ndata:${JSON.stringify({ 
                type: "tool_use",
                input: assistantMsg.tool_calls,
                actionsExecuted: actionsExecuted,
                totalDuration: responseEndTime - responseStartTime
              })}\n\n`
            )
            
            iterations++
          }
        }

        // Take final screenshot before completion
        await sendScreenshot()

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

        // Calculate final waterfall timing
        waterfall.actionExecution = Date.now()
        
        // Send completion event with comprehensive metrics
        try {
          controller.enqueue(
            `event: complete\ndata:${JSON.stringify({ 
              message: "Task completed",
              metrics: {
                totalTime: totalTime,
                actionCount: actionCount,
                actionsPerSecond: actionsPerSecond,
                provider: conv!.provider,
                waterfall,
                toolCalls,
                modelCalls,
                modelCallMetrics: {
                  count: modelCallMetrics.count,
                  totalTime: modelCallMetrics.totalTime,
                  avgTime: avgModelCallTime
                },
                actionTypeBreakdown: actionTypeBreakdown
              }
            })}\n\n`
          )
        } catch (enqueueError) {
          console.error("Failed to enqueue complete event:", enqueueError)
          // Don't throw - just continue
        }

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