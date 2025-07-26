"use client"
import { useState, useRef, useEffect } from "react"
import { motion } from "framer-motion"
// import { Safari } from "@/components/magicui/safari" // TODO: add this back in

export function DemoSection() {
  const [isLoading, setIsLoading] = useState(false)
  const [hasImage, setHasImage] = useState(false)
  const [speed, setSpeed] = useState(50)
  const [inputText, setInputText] = useState("")
  const [convId, setConvId] = useState<string>()
  const [events, setEvents] = useState<any[]>([])
  const [isRunning, setIsRunning] = useState(false)
  const [screenshot, setScreenshot] = useState<string>('')
  const [provider, setProvider] = useState<'anthropic' | 'groq'>('anthropic')
  const [model, setModel] = useState<string>('claude-sonnet-4-20250514')
  const [waitingForStep, setWaitingForStep] = useState(false)
  const [conversationHistory, setConversationHistory] = useState<any[]>([])
  const eventSourceRef = useRef<EventSource | null>(null)

  // Debug screenshot state changes
  useEffect(() => {
    console.log("Screenshot state changed:", screenshot ? `Length: ${screenshot.length}` : "empty")
  }, [screenshot])

  // Function to get current screenshot
  const getCurrentScreenshot = async () => {
    try {
      const response = await fetch('/api/demo/screenshot')
      if (response.ok) {
        const data = await response.json()
        if (data.success && data.screenshot) {
          console.log("Got current screenshot, length:", data.screenshot.length)
          setScreenshot(`data:image/jpeg;base64,${data.screenshot}`)
        }
      }
    } catch (error) {
      console.error("Failed to get current screenshot:", error)
    }
  }

  const handleLaunchInde = async () => {
    setIsLoading(true)
    try {
      const response = await fetch("/api/demo/launch")
      if (response.ok) {
              const data = await response.json()
      
      if (data.error) {
        console.error("❌ Launch error:", data.error, data.details, data.type)
        throw new Error(data.error + (data.details ? `: ${data.details}` : ''))
      }
      
      setHasImage(true)
      // Update the screenshot state
      if (data.screenshot) {
        setScreenshot(data.screenshot)
      }
      }
    } catch (error) {
      console.error("Error launching Inde:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const startStreaming = async (endpoint: string, body: any) => {
    setIsRunning(true)
    setEvents([])
    eventSourceRef.current?.close()

    // Set up periodic screenshot updates
    const screenshotInterval = setInterval(async () => {
      if (isRunning) {
        await getCurrentScreenshot()
      }
    }, 500) // Update every 2 seconds

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })

      if (!response.ok) {
        throw new Error('Failed to start execution')
      }

      const newConvId = response.headers.get('x-conversation-id')
      if (newConvId) {
        setConvId(newConvId)
      }

      // Create EventSource for streaming
      const reader = response.body?.getReader()
      if (!reader) {
        throw new Error('No response body')
      }

      const decoder = new TextDecoder()
      
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value)
        console.log("Received chunk:", chunk)
        const lines = chunk.split('\n')

        let currentEventType = ''
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEventType = line.slice(7)
            console.log("Received event type:", currentEventType)
            continue
          }
          if (line.startsWith('data:')) {
            try {
              const data = JSON.parse(line.slice(5))
              console.log("Received event data:", { type: currentEventType, data })
              setEvents(prev => [...prev, { type: currentEventType, ...data }])
              
              // Update screenshot if available
              if (data.screenshot) {
                console.log("Updating screenshot from data.screenshot, length:", data.screenshot.length)
                const newScreenshot = `data:image/jpeg;base64,${data.screenshot}`
                console.log("Setting screenshot to:", newScreenshot.substring(0, 50) + "...")
                setScreenshot(newScreenshot)
              }
              
              // Handle screenshot events specifically
              if (currentEventType === 'screenshot' && data.screenshot) {
                console.log("Updating screenshot from screenshot event, length:", data.screenshot.length)
                const newScreenshot = `data:image/jpeg;base64,${data.screenshot}`
                console.log("Setting screenshot to:", newScreenshot.substring(0, 50) + "...")
                setScreenshot(newScreenshot)
              }
              
              // Handle agent-specific events
              if (currentEventType === 'waiting_for_step') {
                setWaitingForStep(true)
              } else if (currentEventType === 'conversation_complete') {
                setWaitingForStep(false)
              } else if (currentEventType === 'tool_executed') {
                setWaitingForStep(false)
              } else if (currentEventType === 'step_complete') {
                // Update conversation history from step completion
                if (data.conversationHistory) {
                  console.log("Received updated conversation history:", data.conversationHistory.length, "entries")
                  setConversationHistory(data.conversationHistory)
                }
              }
            } catch (e) {
              console.error('Failed to parse event data:', e)
            }
          }
        }
      }
    } catch (error) {
      console.error('Streaming error:', error)
      setEvents(prev => [...prev, { type: 'error', error: String(error) }])
    } finally {
      clearInterval(screenshotInterval)
      // Get final screenshot
      await getCurrentScreenshot()
      setIsRunning(false)
    }
  }

  const handlePlay = async () => {
    if (!inputText.trim()) return
    
    // Convert speed to delay (inverse relationship)
    const delayMs = Math.max(100, 2000 - (speed * 20))
    
    await startStreaming('/api/demo/play', {
      instruction: inputText.trim(),
      convId,
      delayMs
    })
  }

  const handleForward = async () => {
    if (!inputText.trim() && !convId) return
    
    console.log("Sending conversation history:", conversationHistory.length, "entries")
    
    await startStreaming('/api/demo/forward', {
      instruction: inputText.trim(),
      convId,
      conversationHistory
    })
  }

  const handleAgentStart = async () => {
    if (!inputText.trim()) return
    
    await startStreaming('/api/demo/agent', {
      action: 'start',
      instruction: inputText.trim(),
      convId,
      model,
      provider
    })
  }

  const handleAgentStep = async () => {
    if (!convId) return
    
    await startStreaming('/api/demo/agent', {
      action: 'step',
      convId
    })
  }

  const handleReset = async () => {
    try {
      const response = await fetch("/api/demo/reset", { method: 'POST' })
      if (response.ok) {
        setHasImage(false)
        setEvents([])
        setConvId(undefined)
        setIsRunning(false)
        setScreenshot('')
        setConversationHistory([])
        eventSourceRef.current?.close()
      }
    } catch (error) {
      console.error("Error resetting demo:", error)
    }
  }

  const stopExecution = () => {
    eventSourceRef.current?.close()
    setIsRunning(false)
  }

  return (
    <section id="demo" className="min-h-screen bg-slate-100 py-20">
      <div className="max-w-4xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="text-center mb-16"
        >
          <h2 className="text-5xl md:text-7xl font-black text-slate-900 mb-6">
            Experience <span className="inde-text">Inde</span>
          </h2>
          <p className="text-xl md:text-2xl text-slate-600 font-medium">See AI-powered computer assistance in action</p>
        </motion.div>

        <div className="bg-white rounded-3xl shadow-2xl p-8 border-4 border-slate-900">
          {/* Input Text Box */}
          <div className="mb-8">
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Tell Inde what you want to accomplish..."
              className="w-full px-6 py-4 border-3 border-slate-300 rounded-xl text-lg font-medium focus:border-inde focus:outline-none transition-colors"
              disabled={isRunning}
            />
          </div>

          {/* Computer Screen Interface */}
          <div className="bg-slate-900 rounded-2xl p-6 mb-8 aspect-video max-w-full flex items-center justify-center relative overflow-hidden">
            <div className="absolute top-4 left-4 flex space-x-2 z-10">
              <div className="w-4 h-4 bg-red-500 rounded-full"></div>
              <div className="w-4 h-4 bg-yellow-500 rounded-full"></div>
              <div className="w-4 h-4 bg-green-500 rounded-full"></div>
            </div>

            {!hasImage ? (
              <button
                onClick={handleLaunchInde}
                disabled={isLoading}
                className="px-12 py-6 inde-bg text-white rounded-xl font-bold text-xl hover:opacity-90 transition-opacity disabled:opacity-50 border-2 border-white/20"
              >
                {isLoading ? "Launching..." : "Launch Inde"}
              </button>
            ) : (
              <div className="w-full h-full bg-slate-800 rounded-lg flex items-center justify-center p-4">
                <img
                  src={screenshot || "/placeholder.svg?height=400&width=600&text=Inde+Interface"}
                  alt="Inde Demo Interface"
                  className="max-w-full max-h-full rounded object-contain"
                />
              </div>
            )}
          </div>



          {/* Control Panel */}
          <div className="flex items-center justify-between bg-slate-50 rounded-xl p-6 border-3 border-slate-200">
            <div className="flex items-center space-x-6">
              <button
                onClick={handlePlay}
                disabled={isRunning || !inputText.trim()}
                className="w-14 h-14 bg-green-500 text-white rounded-xl flex items-center justify-center hover:bg-green-600 transition-colors font-bold text-xl border-2 border-green-600 disabled:opacity-50"
              >
                ▶
              </button>
              <button
                onClick={handleForward}
                disabled={isRunning || (!inputText.trim() && !convId)}
                className="w-14 h-14 bg-blue-500 text-white rounded-xl flex items-center justify-center hover:opacity-90 transition-opacity font-bold text-lg border-2 border-blue-600 disabled:opacity-50"
              >
                {">>"}
              </button>
              <button
                onClick={stopExecution}
                disabled={!isRunning}
                className="w-14 h-14 bg-yellow-500 text-white rounded-xl flex items-center justify-center hover:bg-yellow-600 transition-colors font-bold text-xl border-2 border-yellow-600 disabled:opacity-50"
              >
                ⏸
              </button>
              <button
                onClick={handleReset}
                className="w-14 h-14 bg-red-500 text-white rounded-xl flex items-center justify-center hover:bg-red-600 transition-colors font-bold text-xl border-2 border-red-600"
              >
                ↻
              </button>
              <button
                onClick={getCurrentScreenshot}
                disabled={!hasImage}
                className="w-14 h-14 bg-purple-500 text-white rounded-xl flex items-center justify-center hover:bg-purple-600 transition-colors font-bold text-lg border-2 border-purple-600 disabled:opacity-50"
                title="Refresh Screenshot"
              >
                📷
              </button>
            </div>

            <div className="flex items-center space-x-6">
              <label className="text-slate-700 font-bold text-lg">Speed:</label>
              <input
                type="range"
                min="1"
                max="100"
                value={speed}
                onChange={(e) => setSpeed(Number(e.target.value))}
                className="w-32 h-3 accent-inde"
                disabled={isRunning}
              />
              <span className="text-slate-900 font-bold text-lg min-w-[3rem] text-center bg-white px-3 py-1 rounded-lg border-2 border-slate-300">
                {speed}
              </span>
            </div>
          </div>


          {/* Event Stream */}
          {events.length > 0 && (
            <div className="mb-8 mt-16 bg-slate-50 rounded-xl p-4 border-2 border-slate-200">
              <h3 className="text-lg font-bold mb-3 text-slate-900">Event Stream</h3>
              <div className="max-h-32 overflow-y-auto space-y-2">
                {events.map((event, index) => (
                  <div key={index} className="text-sm">
                    <span className="font-mono text-blue-600">{event.type}:</span>
                    <span className="ml-2">{event.text || event.message || JSON.stringify(event)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}


          {/* Agent Controls
          <div className="mb-6 bg-blue-50 rounded-xl p-6 border-3 border-blue-200">
            <h3 className="text-lg font-bold mb-4 text-blue-900">Advanced Agent Controls</h3>
            <div className="flex items-center space-x-4 mb-4">
              <div className="flex items-center space-x-2">
                <label className="text-sm font-medium text-blue-700">Provider:</label>
                <select
                  value={provider}
                  onChange={(e) => setProvider(e.target.value as 'anthropic' | 'groq')}
                  className="px-3 py-1 border border-blue-300 rounded text-sm"
                  disabled={isRunning}
                >
                  <option value="anthropic">Anthropic (Claude)</option>
                  <option value="groq">Groq</option>
                </select>
              </div>
              <div className="flex items-center space-x-2">
                <label className="text-sm font-medium text-blue-700">Model:</label>
                <input
                  type="text"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className="px-3 py-1 border border-blue-300 rounded text-sm w-48"
                  disabled={isRunning}
                  placeholder="claude-sonnet-4-20250514"
                />
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <button
                onClick={handleAgentStart}
                disabled={isRunning || !inputText.trim()}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                Start Agent
              </button>
              <button
                onClick={handleAgentStep}
                // disabled={!waitingForStep}
                className="px-6 py-2 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700 transition-colors disabled:opacity-50"
              >
                Next Step
              </button>
              {waitingForStep && (
                <span className="text-sm text-blue-600 font-medium">⏳ Waiting for next step...</span>
              )}
            </div>
          </div> */}

        </div>
      </div>
    </section>
  )
}
