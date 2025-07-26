import { type NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const speed = searchParams.get("speed") || "50"

  try {
    // Simulate play action with speed parameter
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
