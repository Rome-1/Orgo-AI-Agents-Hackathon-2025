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
  provider: 'anthropic' | 'groq';
};
const conversations = new Map<string, Conv>();

export async function POST(request: NextRequest) {
  const { instruction, convId, conversationHistory = [], provider = 'anthropic' } = await request.json()
  
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

        // Helper function to take and send screenshot
        const sendScreenshot = async () => {
          try {
            const screenshot = await computer.screenshotBase64()
            try {
              controller.enqueue(
                `event: screenshot\ndata:${JSON.stringify({ screenshot })}\n\n`
              )
            } catch (error) {
              console.log("Controller closed, cannot send screenshot")
            }
          } catch (error) {
            console.error("Failed to take screenshot:", error)
          }
        }

        // Send initial screenshot
        await sendScreenshot()

        // Create progress callback for streaming events
        const progressCallback = async (eventType: string, eventData: any) => {
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
          await computer.prompt({ 
            instruction: fullInstruction,
            callback: progressCallback,
            maxIterations: 3, // Take 3 steps per forward click
            maxTokens: 4096
          })
        } else {
          // Use Groq with structured output (JSON schema) instead of tool calls
          const Groq = require('groq-sdk')
          const client = new Groq()
          const { computerActionSchema, execTool } = await import('@/lib/tools')
          
          const messages: any[] = [
            {
              role: "system",
              content: "You are a computer automation assistant. You control a remote desktop and can perform actions like clicking, typing, scrolling, taking screenshots, and waiting. Always respond with a JSON object containing an array of actions to execute. Each action should have the appropriate parameters (coordinates for clicks, text for typing, etc.). Always pass numeric values (not strings) for duration and scroll_amount."
            },
            { role: "user", content: fullInstruction }
          ]
          
          const response = await client.chat.completions.create({
            model: "llama-3.3-70b-versatile",
            messages,
            response_format: {
              type: "json_schema",
              json_schema: computerActionSchema.schema
            },
            max_tokens: 4096,
            stream: false
          })
          
          const assistantMsg = response.choices[0].message
          
          // Parse the structured output
          let actionData
          try {
            actionData = JSON.parse(assistantMsg.content || "{}")
          } catch (parseError) {
            console.error("Failed to parse Groq response:", assistantMsg.content)
            return
          }
          
          // Process actions if any
          if (actionData.actions && actionData.actions.length > 0) {
            for (const action of actionData.actions) {
              try {
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
        }

        // Take final screenshot before completion
        await sendScreenshot()

        // Send completion event with step information and updated history
        controller.enqueue(
          `event: step_complete\ndata:${JSON.stringify({ 
            message: "Step completed",
            currentStep: conv!.currentStep,
            totalHistory: conv!.conversationHistory.length,
            hasMoreWork: conv!.conversationHistory.length < 10, // Arbitrary limit to prevent infinite loops
            conversationHistory: conv!.conversationHistory // Send back the updated history
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
