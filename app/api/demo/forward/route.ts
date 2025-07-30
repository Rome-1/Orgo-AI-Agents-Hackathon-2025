import { type NextRequest, NextResponse } from "next/server"
import { getComputer } from '@/lib/orgo'

export const runtime = 'nodejs'

// Enhanced conversation cache for step-by-step execution
type Conv = { 
  instruction: string; 
  running: boolean;
  currentStep: number;
  totalSteps: number;
  conversationHistory: any[];
  lastResponse: any;
  provider: 'anthropic' | 'groq' | 'cerebras';
};
const conversations = new Map<string, Conv>();

export async function POST(request: NextRequest) {
  const { instruction, convId, conversationHistory = [], provider = 'anthropic', disableDelays = false } = await request.json()
  
  if (!instruction && !convId) {
    return NextResponse.json({ error: "Instruction or conversation ID is required" }, { status: 400 })
  }

  // Generate or use existing conversation ID
  const id = convId ?? crypto.randomUUID()
  let conv = conversations.get(id)
  
  if (!conv) {
    if (!instruction) {
      return NextResponse.json({ error: "Instruction required for new conversation" }, { status: 400 })
    }
    // Initialize new conversation
    conv = { 
      instruction, 
      running: false,
      currentStep: 0,
      totalSteps: 0,
      conversationHistory: [],
      lastResponse: null,
      provider: provider as 'anthropic' | 'groq'
    }
    conversations.set(id, conv)
  } else {
    // Update conversation history from frontend
    conv.conversationHistory = conversationHistory
    conv.provider = provider as 'anthropic' | 'groq'
  }

  if (conv.running) {
    return NextResponse.json({ error: "Already running" }, { status: 409 })
  }

  conv.running = true

  // Create streaming response for single step
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
          
          // Track conversation history
          if (eventType === 'tool_use' || eventType === 'text') {
            conv!.conversationHistory.push({
              step: conv!.currentStep,
              type: eventType,
              data: eventData,
              timestamp: new Date().toISOString()
            })
          }
          
          // Take screenshot after tool_use events
          if (eventType === 'tool_use') {
            await new Promise(resolve => setTimeout(resolve, 500)) // Fixed delay for step-by-step
            try {
              await sendScreenshot()
            } catch (error) {
              console.log("Failed to send screenshot after delay:", error instanceof Error ? error.message : String(error))
            }
          }
        }

        // Execute the instruction with Orgo (single step)
        conv!.currentStep += 1
        
        // Build the instruction with detailed context
        let fullInstruction = conv!.instruction
        
        if (conv!.conversationHistory.length > 0) {
          const historySummary = conv!.conversationHistory
            .map((entry, index) => `Step ${index + 1}: ${entry.type} - ${JSON.stringify(entry.data)}`)
            .join('\n')
          
          fullInstruction = `${conv!.instruction}

PREVIOUS STEPS COMPLETED (${conv!.conversationHistory.length} steps):
${historySummary}

CONTINUE FROM WHERE YOU LEFT OFF. Do not repeat any of the above steps. Take the next logical action to complete the task.`
        }
        
        console.log(`Executing step ${conv!.currentStep} for conversation ${id} with provider: ${conv!.provider}`)
        
        if (conv!.provider === 'anthropic') {
          const modelCallStart = Date.now()
          await computer.prompt({ 
            instruction: fullInstruction,
            callback: progressCallback,
            maxIterations: 3, // Take 3 steps per forward click
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
            { role: "user", content: fullInstruction }
          ]
          
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
          
          // Parse the structured output
          let actionData
          try {
            actionData = JSON.parse(assistantMsg.content || "{}")
            console.log("Parsed Groq response:", JSON.stringify(actionData, null, 2))
          } catch (parseError) {
            console.error("Failed to parse Groq response:", assistantMsg.content)
            console.error("Parse error:", parseError)
            return
          }
          
          // Process actions if any
          if (actionData.actions && actionData.actions.length > 0) {
            console.log(`Executing ${actionData.actions.length} actions from Groq`)
            for (const action of actionData.actions) {
              try {
                console.log("Executing action:", JSON.stringify(action, null, 2))
                
                // Send tool_use event
                await progressCallback('tool_use', { type: "tool_use", input: action })
                
                // Execute the action
                const result = await execTool(computer, action)
                
                // Send tool_result event
                await progressCallback('tool_result', result)
                
                // Add to conversation history
                conv!.conversationHistory.push({
                  step: conv!.currentStep,
                  type: "tool_use",
                  data: { action: action.action, result },
                  timestamp: new Date().toISOString()
                })
                
              } catch (error) {
                console.error("Error processing action:", error)
                // Continue with next action instead of breaking
              }
            }
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
            { role: "user", content: fullInstruction }
          ]
          
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
          
          // Process tool calls if any
          if (assistantMsg.tool_calls?.length) {
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
                await progressCallback('tool_use', { type: "tool_use", input: args })
                
                // Execute the tool
                const result = await execTool(computer, args)
                
                // Send tool_result event
                await progressCallback('tool_result', result)
                
                // Add to conversation history
                conv!.conversationHistory.push({
                  step: conv!.currentStep,
                  type: "tool_use",
                  data: { action: args.action, result },
                  timestamp: new Date().toISOString()
                })
                
                // Add tool result to messages for next iteration
                messages.push({
                  role: "tool",
                  name: call.function.name,
                  content: JSON.stringify(result),
                  tool_call_id: call.id
                })
                
              } catch (error) {
                console.error("Error processing tool call:", error)
                // Continue with next tool call instead of breaking
              }
            }
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

        // Send completion event with step information, updated history, and metrics
        controller.enqueue(
          `event: step_complete\ndata:${JSON.stringify({ 
            message: "Step completed",
            currentStep: conv!.currentStep,
            totalHistory: conv!.conversationHistory.length,
            hasMoreWork: conv!.conversationHistory.length < 10, // Arbitrary limit to prevent infinite loops
            conversationHistory: conv!.conversationHistory, // Send back the updated history
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
        console.error("Forward error:", error)
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

// GET method to check conversation status
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const convId = searchParams.get('convId')

  if (!convId) {
    return NextResponse.json({ error: "Conversation ID required" }, { status: 400 })
  }

  const conv = conversations.get(convId)
  if (!conv) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 })
  }

  return NextResponse.json({
    currentStep: conv.currentStep,
    totalHistory: conv.conversationHistory.length,
    hasMoreWork: conv.conversationHistory.length < 10,
    running: conv.running,
    instruction: conv.instruction
  })
}
