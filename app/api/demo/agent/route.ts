import { type NextRequest, NextResponse } from "next/server"
import { getComputer } from '@/lib/orgo'
import Anthropic from '@anthropic-ai/sdk'
import Groq from 'groq-sdk'

export const runtime = 'nodejs'

// In-memory conversation cache with queue system
type Conv = { 
  messages: any[]
  running: boolean
  waitingForStep: boolean
  pendingToolResults: any[]
  currentResponse: any
  model: string
  provider: 'anthropic' | 'groq'
}

const conversations = new Map<string, Conv>()

// Define tools for Anthropic (computer use)
const ANTHROPIC_TOOLS = [
  {
    type: "computer_20250124",
    name: "computer",
    display_width_px: 1024,
    display_height_px: 768,
    display_number: 1
  }
] as const



export async function POST(request: NextRequest) {
  const { action, instruction, convId, model = "claude-sonnet-4-20250514", provider = "anthropic" } = await request.json()
  
  if (!action) {
    return NextResponse.json({ error: "Action is required" }, { status: 400 })
  }

  // Generate or use existing conversation ID
  const id = convId ?? crypto.randomUUID()
  let conv = conversations.get(id)
  
  if (action === 'start') {
    if (!instruction) {
      return NextResponse.json({ error: "Instruction is required for start action" }, { status: 400 })
    }
    
    conv = { 
      messages: [{ role: "user", content: instruction }],
      running: false,
      waitingForStep: false,
      pendingToolResults: [],
      currentResponse: null,
      model,
      provider: provider as 'anthropic' | 'groq'
    }
    conversations.set(id, conv)
  } else if (!conv) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 })
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

        if (action === 'start') {
          // Start the conversation
          await startConversation(computer, conv!, controller, sendScreenshot)
        } else if (action === 'step') {
          // Execute next step
          await executeNextStep(computer, conv!, controller, sendScreenshot)
        }

        // Send completion event
        controller.enqueue(
          `event: complete\ndata:${JSON.stringify({ message: "Action completed" })}\n\n`
        )

      } catch (error) {
        console.error("Agent error:", error)
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

async function startConversation(computer: any, conv: Conv, controller: any, sendScreenshot: () => Promise<void>) {
  if (conv.provider === 'anthropic') {
    // Use Orgo's computer.prompt() for Anthropic (more reliable)
    const progressCallback = async (eventType: string, eventData: any) => {
      controller.enqueue(
        `event: ${eventType}\ndata:${JSON.stringify(eventData)}\n\n`
      )
      
      // Take screenshot after tool_use events
      if (eventType === 'tool_use') {
        await new Promise(resolve => setTimeout(resolve, 500))
        await sendScreenshot()
      }
    }

    await computer.prompt({ 
      instruction: conv.messages[0].content,
      callback: progressCallback,
      maxIterations: 1, // Single step for agent mode
      maxTokens: 4096
    })

    // Send completion event
    controller.enqueue(
      `event: waiting_for_step\ndata:${JSON.stringify({ message: "Waiting for next step" })}\n\n`
    )
  } else {
    // Use Groq with custom tool system
    const client = new Groq()
    const response = await getModelResponse(client, conv.messages, conv.model, conv.provider)
    conv.currentResponse = response
    conv.messages.push({ role: "assistant", content: response.content })

    // Send Groq's response
    for (const block of response.content) {
      controller.enqueue(
        `event: ${block.type}\ndata:${JSON.stringify(block)}\n\n`
      )
    }

    // Process tool requests if any
    await processToolRequests(computer, conv, controller, sendScreenshot)
  }
}

async function executeNextStep(computer: any, conv: Conv, controller: any, sendScreenshot: () => Promise<void>) {
  if (conv.provider === 'anthropic') {
    // For Anthropic, continue with the next iteration
    const progressCallback = async (eventType: string, eventData: any) => {
      controller.enqueue(
        `event: ${eventType}\ndata:${JSON.stringify(eventData)}\n\n`
      )
      
      // Take screenshot after tool_use events
      if (eventType === 'tool_use') {
        await new Promise(resolve => setTimeout(resolve, 500))
        await sendScreenshot()
      }
    }

    await computer.prompt({ 
      instruction: conv.messages[0].content,
      callback: progressCallback,
      maxIterations: 1, // Single step for agent mode
      maxTokens: 4096
    })

    // Send completion event
    controller.enqueue(
      `event: waiting_for_step\ndata:${JSON.stringify({ message: "Waiting for next step" })}\n\n`
    )
  } else {
    // For Groq, handle pending tool results
    if (conv.pendingToolResults.length > 0) {
      // Send pending tool results back to model
      conv.messages.push({ role: "user", content: conv.pendingToolResults })
      conv.pendingToolResults = []

      const client = new Groq()
      const response = await getModelResponse(client, conv.messages, conv.model, conv.provider)
      conv.currentResponse = response
      conv.messages.push({ role: "assistant", content: response.content })

      // Send model's response
      for (const block of response.content) {
        controller.enqueue(
          `event: ${block.type}\ndata:${JSON.stringify(block)}\n\n`
        )
      }

      // Process tool requests if any
      await processToolRequests(computer, conv, controller, sendScreenshot)
    }
  }
}

async function processToolRequests(computer: any, conv: Conv, controller: any, sendScreenshot: () => Promise<void>) {
  const toolResults = []

  if (conv.provider === 'anthropic') {
    // Handle Anthropic tool_use format
    for (const block of conv.currentResponse.content) {
      if (block.type === "tool_use") {
        const result = await executeToolAction(computer, block)
        
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: [result]
        })

        controller.enqueue(
          `event: tool_executed\ndata:${JSON.stringify({ action: block.input.action, result })}\n\n`
        )

        await sendScreenshot()
      }
    }
  } else {
    // Handle Groq tool_calls format
    if (conv.currentResponse.choices && conv.currentResponse.choices[0].message.tool_calls) {
      for (const toolCall of conv.currentResponse.choices[0].message.tool_calls) {
        const functionArgs = JSON.parse(toolCall.function.arguments)
        const result = await executeGroqToolAction(computer, functionArgs)
        
        toolResults.push({
          role: "tool",
          content: JSON.stringify(result),
          tool_call_id: toolCall.id
        })

        controller.enqueue(
          `event: tool_executed\ndata:${JSON.stringify({ action: functionArgs.action, result })}\n\n`
        )

        await sendScreenshot()
      }
    }
  }

  // Store tool results for next step
  conv.pendingToolResults = toolResults

  // Check if conversation is complete
  if (toolResults.length === 0) {
    controller.enqueue(
      `event: conversation_complete\ndata:${JSON.stringify({ message: "Conversation completed" })}\n\n`
    )
  } else {
    controller.enqueue(
      `event: waiting_for_step\ndata:${JSON.stringify({ message: "Waiting for next step" })}\n\n`
    )
  }
}

async function getModelResponse(client: any, messages: any[], model: string, provider: string) {
  if (provider === 'anthropic') {
    return await client.messages.create({
      model: "claude-sonnet-4-20250514", // model 
      messages,
      tools: ANTHROPIC_TOOLS as any,
      betas: ["computer-use-2025-01-24"],// ["computer-use-2024-10-22"], // ["computer-use-2025-01-24"],
      max_tokens: 4096
    })
  } else {
    // Groq implementation
    const { computerTool } = await import('@/lib/tools')
    return await client.chat.completions.create({
      model, // llama-3.3-70b-versatile
      messages,
      tools: [computerTool],
      tool_choice: "auto",
      max_tokens: 4096
    })
  }
}

async function executeToolAction(computer: any, toolBlock: any) {
  const action = toolBlock.input.action
  
  try {
    if (action === "screenshot") {
      const imageData = await computer.screenshotBase64()
      return {
        type: "image",
        source: {
          type: "base64",
          media_type: "image/jpeg",
          data: imageData
        }
      }
    } else if (action === "left_click") {
      const [x, y] = toolBlock.input.coordinate
      await computer.leftClick(x, y)
      return { type: "text", text: `Clicked at (${x}, ${y})` }
    } else if (action === "right_click") {
      const [x, y] = toolBlock.input.coordinate
      await computer.rightClick(x, y)
      return { type: "text", text: `Right-clicked at (${x}, ${y})` }
    } else if (action === "double_click") {
      const [x, y] = toolBlock.input.coordinate
      await computer.doubleClick(x, y)
      return { type: "text", text: `Double-clicked at (${x}, ${y})` }
    } else if (action === "type") {
      const text = toolBlock.input.text
      await computer.type(text)
      return { type: "text", text: `Typed: ${text}` }
    } else if (action === "key") {
      const key = toolBlock.input.text
      await computer.key(key)
      return { type: "text", text: `Pressed: ${key}` }
    } else if (action === "scroll") {
      const direction = toolBlock.input.scroll_direction || "down"
      const amount = toolBlock.input.scroll_amount || 1
      await computer.scroll(direction, amount)
      return { type: "text", text: `Scrolled ${direction} by ${amount}` }
    } else if (action === "wait") {
      const duration = toolBlock.input.duration || 1
      await computer.wait(duration)
      return { type: "text", text: `Waited for ${duration} seconds` }
    } else {
      return { type: "text", text: `Unsupported action: ${action}` }
    }
  } catch (error) {
    return { type: "text", text: `Error executing ${action}: ${error}` }
  }
}

async function executeGroqToolAction(computer: any, args: any) {
  const action = args.action
  
  try {
    if (action === "screenshot") {
      const imageData = await computer.screenshotBase64()
      return {
        type: "image",
        source: {
          type: "base64",
          media_type: "image/jpeg",
          data: imageData
        }
      }
    } else if (action === "left_click") {
      const [x, y] = args.coordinate
      await computer.leftClick(x, y)
      return { type: "text", text: `Clicked at (${x}, ${y})` }
    } else if (action === "right_click") {
      const [x, y] = args.coordinate
      await computer.rightClick(x, y)
      return { type: "text", text: `Right-clicked at (${x}, ${y})` }
    } else if (action === "double_click") {
      const [x, y] = args.coordinate
      await computer.doubleClick(x, y)
      return { type: "text", text: `Double-clicked at (${x}, ${y})` }
    } else if (action === "type") {
      const text = args.text
      await computer.type(text)
      return { type: "text", text: `Typed: ${text}` }
    } else if (action === "key") {
      const key = args.text
      await computer.key(key)
      return { type: "text", text: `Pressed: ${key}` }
    } else if (action === "scroll") {
      const direction = args.scroll_direction || "down"
      const amount = args.scroll_amount || 1
      await computer.scroll(direction, amount)
      return { type: "text", text: `Scrolled ${direction} by ${amount}` }
    } else if (action === "wait") {
      const duration = args.duration || 1
      await computer.wait(duration)
      return { type: "text", text: `Waited for ${duration} seconds` }
    } else {
      return { type: "text", text: `Unsupported action: ${action}` }
    }
  } catch (error) {
    return { type: "text", text: `Error executing ${action}: ${error}` }
  }
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
    waitingForStep: conv.waitingForStep,
    hasPendingResults: conv.pendingToolResults.length > 0,
    messageCount: conv.messages.length
  })
} 