import { NextResponse } from "next/server"
import { getComputer } from '@/lib/orgo'

export const runtime = 'nodejs'

export async function GET() {
  try {
    const computer = await getComputer()
    const screenshot = await computer.screenshotBase64()
    
    return NextResponse.json({
      success: true,
      screenshot: screenshot
    })
  } catch (error) {
    console.error("Failed to get screenshot:", error)
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : String(error) 
      }, 
      { status: 500 }
    )
  }
} 