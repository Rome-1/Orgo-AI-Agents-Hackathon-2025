import { NextResponse } from "next/server"

export async function GET() {
  try {
    // Simulate reset action
    console.log("Resetting demo")

    return NextResponse.json({
      success: true,
      message: "Demo reset successfully",
    })
  } catch (error) {
    console.error("Error resetting demo:", error)
    return NextResponse.json({ error: "Failed to reset demo" }, { status: 500 })
  }
}
