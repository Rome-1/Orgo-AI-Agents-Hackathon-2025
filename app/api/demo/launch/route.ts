import { NextResponse } from "next/server"
import { getComputer } from '@/lib/orgo'

export const runtime = 'nodejs'

export async function GET() {
  try {
    if (!process.env.ORGO_API_KEY) {
      return NextResponse.json({ error: "ORGO_API_KEY environment variable is required" }, { status: 500 })
    }
    
    if (!process.env.ORGO_PROJECT_ID) {
      return NextResponse.json({ error: "ORGO_PROJECT_ID environment variable is required" }, { status: 500 })
    }

    const computer = await getComputer()
    const screenshot = await computer.screenshotBase64()

    return NextResponse.json({
      success: true,
      message: "Inde launched successfully",
      screenshot: `data:image/jpeg;base64,${screenshot}`,
    })
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    const errorName = error instanceof Error ? error.name : 'UnknownError'
    
    return NextResponse.json({ 
      error: "Failed to launch Inde",
      details: errorMessage,
      type: errorName
    }, { status: 500 })
  }
}
