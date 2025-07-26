import { NextRequest } from 'next/server';
import { resetComputer } from '@/lib/orgo';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    await resetComputer();

    // TODO: return screenshot of new computer state
    
    return new Response(JSON.stringify({ 
      success: true, 
      message: 'Computer restarted successfully' 
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Reset error:', error);
    return new Response(JSON.stringify({ 
      error: 'Failed to restart computer' 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
} 