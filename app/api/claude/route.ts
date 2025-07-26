import { NextRequest } from 'next/server';
import { getComputer } from '@/lib/orgo';

export const runtime = 'nodejs'; // keep stateful Map

// 🗄️   in‑memory conversation cache (OK for PoC / dev)
type Conv = { instruction: string; running: boolean };
const conversations = new Map<string, Conv>();

/** Create or continue an agent loop */
export async function POST(req: NextRequest) {
  const { convId, instruction, mode, delayMs = 500 } = await req.json();

  // If no convId ⇒ new conversation
  const id = convId ?? crypto.randomUUID();
  let conv = conversations.get(id);
  if (!conv) {
    conv = { instruction, running: false };
    conversations.set(id, conv);
  }

  // Return the conversation ID in headers
  const headers = new Headers({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'x-conversation-id': id
  });

  // ---------------------------------------------------------------- streaming body
  const stream = new ReadableStream({
    async start(controller) {
      if (conv!.running) {
        controller.close(); // already running somewhere else
        return;
      }
      conv!.running = true;

      const computer = await getComputer();

      // Create a progress callback to stream events
      const progressCallback = (eventType: string, eventData: any) => {
        controller.enqueue(
          `event: ${eventType}\ndata:${JSON.stringify(eventData)}\n\n`
        );
      };

      try {
        // Use Orgo's built-in prompt method
        await computer.prompt({ instruction: conv!.instruction });
      } catch (error) {
        controller.enqueue(
          `event: error\ndata:${JSON.stringify({ error: String(error) })}\n\n`
        );
      } finally {
        conv!.running = false;
        controller.close();
      }
    },
  });

  return new Response(stream, { headers });
} 