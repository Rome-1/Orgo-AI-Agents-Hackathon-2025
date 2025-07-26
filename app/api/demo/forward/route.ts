import { type NextRequest, NextResponse } from "next/server"
import { getComputer } from '@/lib/orgo'

export const runtime = 'nodejs'

// Share the same conversation cache as play route
type Conv = { instruction: string; running: boolean };
const conversations = new Map<string, Conv>();

export async function POST(request: NextRequest) {
  const { instruction, convId } = await request.json()
  
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
    conv = { instruction, running: false }
    conversations.set(id, conv)
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

        // Create progress callback for streaming events
        const progressCallback = (eventType: string, eventData: any) => {
          controller.enqueue(
            `event: ${eventType}\ndata:${JSON.stringify(eventData)}\n\n`
          )
        }

        // Execute the instruction with Orgo (single step)
        await computer.prompt({ 
          instruction: conv!.instruction,
          callback: progressCallback,
          maxIterations: 1, // Only one step
          maxTokens: 4096
        })

        // Send completion event
        controller.enqueue(
          `event: step_complete\ndata:${JSON.stringify({ message: "Step completed" })}\n\n`
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

// Keep the GET method for backward compatibility
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const speed = searchParams.get("speed") || "50"

  try {
    console.log(`Forwarding demo at speed: ${speed}`)

    return NextResponse.json({
      success: true,
      message: `Demo forwarded at speed ${speed}`,
      speed: Number.parseInt(speed),
    })
  } catch (error) {
    console.error("Error forwarding demo:", error)
    return NextResponse.json({ error: "Failed to forward demo" }, { status: 500 })
  }
}
