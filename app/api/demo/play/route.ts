import { type NextRequest, NextResponse } from "next/server"
import { getComputer } from '@/lib/orgo'

export const runtime = 'nodejs'

// In-memory conversation cache
type Conv = { 
  instruction: string; 
  running: boolean;
  provider: 'anthropic' | 'groq';
};
const conversations = new Map<string, Conv>();

export async function POST(request: NextRequest) {
  const { instruction, convId, delayMs = 1, provider = 'anthropic' } = await request.json()
  
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

        // Helper function to take and send screenshot
        const sendScreenshot = async () => {
          try {
            console.log("Taking screenshot...")
            const screenshot = await computer.screenshotBase64()
            console.log("Screenshot taken, length:", screenshot?.length || 0)
            try {
              controller.enqueue(
                `event: screenshot\ndata:${JSON.stringify({ screenshot })}\n\n`
              )
              console.log("Screenshot event sent")
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
          console.log(`Play callback: ${eventType}`, eventData)
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
            // Use a more reliable delay mechanism
            await new Promise(resolve => setTimeout(resolve, delayMs))
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
          await computer.prompt({ 
            instruction: conv!.instruction,
            callback: progressCallback,
            maxIterations: 10,
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
            { role: "user", content: conv!.instruction }
          ]
          
          let iterations = 0
          const maxIterations = 10
          
          while (iterations < maxIterations) {
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
            
            // Push assistant message to history
            messages.push(assistantMsg)
            
            // Parse the structured output
            let actionData
            try {
              actionData = JSON.parse(assistantMsg.content || "{}")
            } catch (parseError) {
              console.error("Failed to parse Groq response:", assistantMsg.content)
              break
            }
            
            // No actions → agent is done
            if (!actionData.actions || actionData.actions.length === 0) {
              break
            }
            
            // Execute each action
            for (const action of actionData.actions) {
              try {
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
                
                // Add delay between actions
                await new Promise(resolve => setTimeout(resolve, delayMs))
                
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
        }

        // Take final screenshot before completion
        await sendScreenshot()

        // Send completion event
        controller.enqueue(
          `event: complete\ndata:${JSON.stringify({ message: "Task completed" })}\n\n`
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