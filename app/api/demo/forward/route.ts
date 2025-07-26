import { type NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const speed = searchParams.get("speed") || "50"

  try {
    // Simulate forward action with speed parameter
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
