import { type NextRequest, NextResponse } from "next/server"
import { getComputer } from '@/lib/orgo'

export const runtime = 'nodejs'

// In-memory conversation cache
type Conv = { instruction: string; running: boolean };
const conversations = new Map<string, Conv>();

export async function POST(request: NextRequest) {
  const { instruction, convId, delayMs = 1 } = await request.json()
  
  if (!instruction) {
    return NextResponse.json({ error: "Instruction is required" }, { status: 400 })
  }

  // Generate or use existing conversation ID
  const id = convId ?? crypto.randomUUID()
  let conv = conversations.get(id)
  if (!conv) {
    conv = { instruction, running: false }
    conversations.set(id, conv)
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
            const screenshot = await computer.screenshotBase64()
            controller.enqueue(
              `event: screenshot\ndata:${JSON.stringify({ screenshot })}\n\n`
            )
          } catch (error) {
            console.error("Failed to take screenshot:", error)
          }
        }

        // Send initial screenshot
        await sendScreenshot()

        // Create progress callback for streaming events
        const progressCallback = (eventType: string, eventData: any) => {
          controller.enqueue(
            `event: ${eventType}\ndata:${JSON.stringify(eventData)}\n\n`
          )
          
          // Take screenshot after tool_use events
          if (eventType === 'tool_use') {
            setTimeout(async () => {
              await sendScreenshot()
            }, delayMs)
          }
        }

        // Execute the instruction with Orgo
        await computer.prompt({ 
          instruction: conv!.instruction,
          callback: progressCallback,
          maxIterations: 5,
          maxTokens: 4096
        })

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