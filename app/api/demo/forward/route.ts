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
        // Start timing the Orgo instantiation
        const orgoStartTime = Date.now()
        const computer = await getComputer()
        const orgoEndTime = Date.now()
        
        // Metrics tracking
        const startTime = Date.now()
        let actionCount = 0
        const actionTypeMetrics: { [key: string]: { count: number, totalTime: number } } = {}
        const modelCallMetrics: { count: number, totalTime: number } = { count: 0, totalTime: 0 }
        
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
            
            // Track conversation history
            conv!.conversationHistory.push({
              step: conv!.currentStep,
              type: eventType,
              data: eventData,
              timestamp: new Date().toISOString()
            })
            
            // Take screenshot after tool_use events
            await new Promise(resolve => setTimeout(resolve, 500)) // Fixed delay for step-by-step
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
            
            // Track conversation history for text events
            if (eventType === 'text') {
              conv!.conversationHistory.push({
                step: conv!.currentStep,
                type: eventType,
                data: eventData,
                timestamp: new Date().toISOString()
              })
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
          waterfall.modelCallStart = Date.now()
          await computer.prompt({ 
            instruction: fullInstruction,
            callback: progressCallback,
            maxIterations: 3, // Take 3 steps per forward click
            maxTokens: 4096
          })
          waterfall.modelCallEnd = Date.now()
          modelCallMetrics.count++
          modelCallMetrics.totalTime += (waterfall.modelCallEnd - waterfall.modelCallStart)
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
            { role: "user", content: fullInstruction }
          ]
          
          waterfall.modelCallStart = Date.now()
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
          modelCallMetrics.count++
          modelCallMetrics.totalTime += (waterfall.modelCallEnd - waterfall.modelCallStart)
          
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
            
            // Set tool call timing
            waterfall.toolCallStart = Date.now()
            
            for (const action of actionData.actions) {
              try {
                console.log("Executing action:", JSON.stringify(action, null, 2))
                
                // Send tool_use event
                try {
                  await progressCallback('tool_use', { type: "tool_use", input: action })
                } catch (enqueueError) {
                  console.error("Failed to send tool_use event:", enqueueError)
                  // Don't throw - just continue
                }
                
                // Execute the action
                const result = await execTool(computer, action)
                
                // Send tool_result event
                try {
                  await progressCallback('tool_result', result)
                } catch (enqueueError) {
                  console.error("Failed to send tool_result event:", enqueueError)
                  // Don't throw - just continue
                }
                
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
            
            // Set tool call end timing
            waterfall.toolCallEnd = Date.now()
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
            { role: "user", content: fullInstruction }
          ]
          
          waterfall.modelCallStart = Date.now()
          const response = await client.chat.completions.create({
            model: "llama-4-maverick-17b-128e-instruct", //"qwen-3-235b-a22b-instruct-2507",
            messages,
            tools: [cerebrasComputerTool],
            parallel_tool_calls: false,
            max_tokens: 4096,
            stream: false
          })
          waterfall.modelCallEnd = Date.now()
          modelCallMetrics.count++
          modelCallMetrics.totalTime += (waterfall.modelCallEnd - waterfall.modelCallStart)
          
          const assistantMsg = response.choices[0].message
          
          // Process tool calls if any
          if (assistantMsg.tool_calls?.length) {
            // Set tool call timing
            waterfall.toolCallStart = Date.now()
            
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
            
            // Set tool call end timing
            waterfall.toolCallEnd = Date.now()
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

        // Calculate final waterfall timing
        waterfall.actionExecution = Date.now()

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
