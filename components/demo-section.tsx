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
  const [provider, setProvider] = useState<'anthropic' | 'groq' | 'cerebras'>('anthropic')
  const [model, setModel] = useState<string>('claude-sonnet-4-20250514')
  const [waitingForStep, setWaitingForStep] = useState(false)
  const [conversationHistory, setConversationHistory] = useState<any[]>([])
  const [metrics, setMetrics] = useState<{
    totalTime?: number
    actionCount?: number
    actionsPerSecond?: string
    provider?: string
    modelCallMetrics?: {
      count: number
      totalTime: number
      avgTime: string
    }
    actionTypeBreakdown?: Array<{
      type: string
      count: number
      avgTime: string
    }>
  } | null>(null)
  
  // Comprehensive performance tracking state
  const [performanceProfiles, setPerformanceProfiles] = useState<Array<{
    id: string
    timestamp: Date
    provider: string
    speed: number
    delayMs: number
    totalTime: number
    actionCount: number
    actionsPerSecond: string
    waterfall: {
      apiServerHit: number
      orgoInstantiation: number
      modelCallStart: number
      modelCallEnd: number
      toolCallStart: number
      toolCallEnd: number
      actionExecution: number
    }
    toolCalls: Array<{
      type: string
      startTime: number
      endTime: number
      duration: number
      success: boolean
      error?: string
    }>
    modelCalls: Array<{
      startTime: number
      endTime: number
      duration: number
      tokensUsed?: number
    }>
  }>>([])
  const [disableDelays, setDisableDelays] = useState(false)
  const eventSourceRef = useRef<EventSource | null>(null)
  const sliderRef = useRef<HTMLInputElement>(null)

  // Debug screenshot state changes
  useEffect(() => {
    console.log("Screenshot state changed:", screenshot ? `Length: ${screenshot.length}` : "empty")
  }, [screenshot])

  // Update slider styling when speed changes
  useEffect(() => {
    if (sliderRef.current) {
      sliderRef.current.style.background = `linear-gradient(to right, var(--inde-color) 0%, var(--inde-color) ${speed}%, #e2e8f0 ${speed}%, #e2e8f0 100%)`
    }
  }, [speed])

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
            if (currentEventType === 'screenshot') {
              console.log("Screenshot event detected!")
            }
            continue
          }
          if (line.startsWith('data:')) {
            try {
              const data = JSON.parse(line.slice(5))
              console.log("Received event data:", { type: currentEventType, data })
              
              // Filter out screenshot data from event display
              let displayData = data
              if (currentEventType === 'screenshot') {
                // Keep screenshot functionality but don't display the full data
                displayData = {
                  ...data,
                  screenshot: '[Screenshot Data]', // Replace base64 with placeholder
                  data: '[Screenshot Data]' // Also replace data field if present
                }
                
                // Update screenshot state for display (keep the original data for functionality)
                if (data.screenshot) {
                  console.log("Updating screenshot from data.screenshot, length:", data.screenshot.length)
                  const newScreenshot = `data:image/jpeg;base64,${data.screenshot}`
                  console.log("Setting screenshot to:", newScreenshot.substring(0, 50) + "...")
                  setScreenshot(newScreenshot)
                  setHasImage(true)
                }
              }
              
              // Add event to stream (with filtered data for screenshots)
              setEvents(prev => [...prev, { type: currentEventType, ...displayData }])
              
              // Update screenshot if available (for non-screenshot events)
              if (data.screenshot && currentEventType !== 'screenshot') {
                console.log("Updating screenshot from data.screenshot, length:", data.screenshot.length)
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
                // Update metrics if available
                if (data.metrics) {
                  console.log("Received metrics:", data.metrics)
                  setMetrics(data.metrics)
                }
              } else if (currentEventType === 'complete') {
                // Update metrics from completion event
                if (data.metrics) {
                  console.log("Received completion metrics:", data.metrics)
                  setMetrics(data.metrics)
                  
                  // Add to performance profiles
                  const profile = {
                    id: crypto.randomUUID(),
                    timestamp: new Date(),
                    provider: provider,
                    speed: speed,
                    delayMs: Math.max(0, 2000 - (speed * 20)),
                    totalTime: data.metrics.totalTime || 0,
                    actionCount: data.metrics.actionCount || 0,
                    actionsPerSecond: data.metrics.actionsPerSecond || '0.00',
                    waterfall: data.metrics.waterfall || {
                      apiServerHit: 0,
                      orgoInstantiation: 0,
                      modelCallStart: 0,
                      modelCallEnd: 0,
                      toolCallStart: 0,
                      toolCallEnd: 0,
                      actionExecution: 0
                    },
                    toolCalls: data.metrics.toolCalls || [],
                    modelCalls: data.metrics.modelCalls || []
                  }
                  setPerformanceProfiles(prev => [profile, ...prev.slice(0, 9)]) // Keep last 10
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
    
    // Convert speed to delay (inverse relationship) - max speed = 0 delay
    const delayMs = Math.max(0, 2000 - (speed * 20))
    
    console.log("Playing with provider:", provider)
    
    await startStreaming('/api/demo/play', {
      instruction: inputText.trim(),
      convId,
      delayMs,
      provider,
      disableDelays
    })
  }

  const handleForward = async () => {
    if (!inputText.trim() && !convId) return
    
    console.log("Sending conversation history:", conversationHistory.length, "entries")
    console.log("Using provider:", provider)
    
    await startStreaming('/api/demo/forward', {
      instruction: inputText.trim(),
      convId,
      conversationHistory,
      provider,
      disableDelays
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
        setMetrics(null)
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
    <section id="demo" className="min-h-screen bg-slate-50 py-20">
      <div className="max-w-4xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="text-center mb-16"
        >
          <h2 className="text-5xl md:text-7xl font-black text-slate-900 mb-6">
            Experience <span className="text-inde">Inde</span>
          </h2>
          <p className="text-xl md:text-2xl text-slate-600 font-medium">See AI-powered computer assistance in action</p>
        </motion.div>

        <div className="bg-white rounded-3xl shadow-2xl p-8 border-4 border-slate-200">
          {/* Input Text Box */}
          <div className="mb-8">
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Tell Inde what you want to accomplish..."
              className="w-full px-6 py-4 border-2 border-slate-300 rounded-xl text-lg font-medium focus:border-inde focus:outline-none transition-colors"
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
                className="px-12 py-6 bg-inde text-white rounded-xl font-bold text-xl hover:bg-inde/90 transition-colors disabled:opacity-50 border-2 border-white/20"
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
          <div className="bg-slate-50 rounded-xl p-6 border-2 border-slate-200">
            <div className="flex flex-col space-y-4">
              {/* Controls Row */}
              <div className="flex items-center space-x-4">
                {/* Model Selector */}
                <div className="flex items-center space-x-3">
                  <label className="text-slate-700 font-bold text-sm">AI Model:</label>
                  <select
                    value={provider}
                    onChange={(e) => setProvider(e.target.value as 'anthropic' | 'groq' | 'cerebras')}
                    className="px-4 py-2 bg-white text-slate-900 rounded-xl font-bold text-sm border-2 border-slate-300 hover:border-inde focus:border-inde focus:outline-none transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                    disabled={isRunning}
                  >
                    <option value="anthropic">🤖 Claude</option>
                    <option value="groq">⚡ Groq</option>
                    <option value="cerebras">🚀 Cerebras</option>
                  </select>
                </div>

                {/* Speed Control */}
                <div className="flex items-center space-x-3">
                  <label className="text-slate-700 font-bold text-sm">Speed:</label>
                  <div className="flex items-center space-x-2 bg-white rounded-xl border-2 border-slate-300 px-3 py-2 shadow-sm">
                    <input
                      ref={sliderRef}
                      type="range"
                      min="1"
                      max="100"
                      value={speed}
                      onChange={(e) => setSpeed(Number(e.target.value))}
                      className="w-24 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer slider focus:outline-none"
                      disabled={isRunning}
                    />
                    <span className="text-slate-900 font-bold text-lg min-w-[2.5rem] text-center">
                      {speed}
                    </span>
                  </div>
                </div>

                {/* Delay Toggle */}
                <div className="flex items-center space-x-3">
                  <label className="text-slate-700 font-bold text-sm">Delays:</label>
                  <button
                    onClick={() => setDisableDelays(!disableDelays)}
                    disabled={isRunning}
                    className={`px-4 py-2 rounded-xl font-bold text-sm border-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm ${
                      !disableDelays 
                        ? 'bg-green-500 text-white border-green-600 hover:bg-green-600' 
                        : 'bg-red-500 text-white border-red-600 hover:bg-red-600'
                    }`}
                  >
                    {!disableDelays ? '✅ Enabled' : '❌ Disabled'}
                  </button>
                </div>
              </div>

              {/* Action Buttons Row */}
              <div className="flex items-center space-x-4">
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
            </div>
          </div>


          {/* Metrics Display */}
          {metrics && (
            <div className="mb-8 mt-8 bg-inde/10 rounded-xl p-6 border-2 border-inde/20">
              <h3 className="text-lg font-bold mb-4 text-slate-900">Performance Metrics</h3>
              
              {/* Basic Metrics */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div className="text-center">
                  <div className="text-2xl font-bold text-inde">{metrics.provider}</div>
                  <div className="text-sm text-slate-600">Provider</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-inde">{metrics.totalTime}ms</div>
                  <div className="text-sm text-slate-600">Total Time</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-inde">{metrics.actionCount}</div>
                  <div className="text-sm text-slate-600">Actions</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-inde">{metrics.actionsPerSecond}/s</div>
                  <div className="text-sm text-slate-600">Actions/Second</div>
                </div>
              </div>

              {/* Action Type Breakdown */}
              {metrics.actionTypeBreakdown && metrics.actionTypeBreakdown.length > 0 && (
                <div className="p-4 bg-white rounded-lg border border-slate-200">
                  <h4 className="text-md font-bold mb-3 text-slate-800">Action Type Breakdown</h4>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {metrics.actionTypeBreakdown.map((action, index) => (
                      <div key={index} className="text-center p-2 bg-slate-50 rounded">
                        <div className="text-lg font-bold text-inde">{action.type}</div>
                        <div className="text-sm text-slate-600">{action.count} actions</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

                    {/* Speed Report */}
          <div className="mb-8 mt-8 bg-gradient-to-r from-inde/20 to-blue-500/20 rounded-xl p-6 border-2 border-inde/30">
            <h3 className="text-lg font-bold mb-4 text-slate-900">Speed Report</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-inde">{speed}</div>
                <div className="text-sm text-slate-600">Speed Setting</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-inde">{Math.max(0, 2000 - (speed * 20))}ms</div>
                <div className="text-sm text-slate-600">Delay Between Actions</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-inde">{disableDelays ? 'Disabled' : 'Enabled'}</div>
                <div className="text-sm text-slate-600">Delays Status</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-inde">{provider}</div>
                <div className="text-sm text-slate-600">AI Provider</div>
              </div>
            </div>
          </div>

          {/* Performance Profiling Tools */}
          {performanceProfiles.length > 0 && (
            <div className="mb-8 mt-8 bg-gradient-to-r from-purple-500/20 to-pink-500/20 rounded-xl p-6 border-2 border-purple-300">
              <h3 className="text-lg font-bold mb-4 text-slate-900">Performance Profiling History</h3>
              <div className="space-y-3 max-h-64 overflow-y-auto">
                {performanceProfiles.map((profile, index) => (
                  <div key={profile.id} className="bg-white rounded-lg p-4 border border-slate-200 shadow-sm">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center space-x-3">
                        <span className="text-sm font-bold text-slate-600">
                          #{index + 1}
                        </span>
                        <span className="text-sm text-slate-500">
                          {profile.timestamp.toLocaleTimeString()}
                        </span>
                        <span className={`px-2 py-1 rounded text-xs font-bold ${
                          profile.provider === 'anthropic' ? 'bg-blue-100 text-blue-800' :
                          profile.provider === 'groq' ? 'bg-green-100 text-green-800' :
                          'bg-purple-100 text-purple-800'
                        }`}>
                          {profile.provider}
                        </span>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-bold text-inde">Speed {profile.speed}</div>
                        <div className="text-xs text-slate-500">{profile.delayMs}ms delay</div>
                      </div>
                    </div>
                    
                                          <div className="grid grid-cols-4 gap-3 text-center">
                        <div>
                          <div className="text-sm font-bold text-slate-900">{profile.totalTime}ms</div>
                          <div className="text-xs text-slate-600">Total Time</div>
                        </div>
                        <div>
                          <div className="text-sm font-bold text-slate-900">{profile.actionCount}</div>
                          <div className="text-xs text-slate-600">Actions</div>
                        </div>
                        <div>
                          <div className="text-sm font-bold text-slate-900">{profile.actionsPerSecond}/s</div>
                          <div className="text-xs text-slate-600">Actions/Second</div>
                        </div>
                        <div>
                          <div className="text-sm font-bold text-slate-900">{profile.toolCalls?.length || 0}</div>
                          <div className="text-xs text-slate-600">Tool Calls</div>
                        </div>
                      </div>
                      
                      {/* Waterfall Timeline */}
                      {profile.waterfall && (
                        <div className="mt-3 pt-3 border-t border-slate-200">
                          <div className="text-xs font-bold text-slate-600 mb-2">Waterfall Timeline</div>
                          <div className="space-y-1">
                            <div className="flex justify-between text-xs">
                              <span>Model Call Start</span>
                              <span className="font-mono">{profile.waterfall.modelCallStart - profile.waterfall.apiServerHit}ms</span>
                            </div>
                            <div className="flex justify-between text-xs">
                              <span>Model Call End</span>
                              <span className="font-mono">{profile.waterfall.modelCallEnd - profile.waterfall.apiServerHit}ms</span>
                            </div>
                            <div className="flex justify-between text-xs">
                              <span>Action Execution</span>
                              <span className="font-mono">{profile.waterfall.actionExecution - profile.waterfall.apiServerHit}ms</span>
                            </div>
                          </div>
                          
                          {/* Performance Breakdown */}
                          <div className="mt-3 pt-3 border-t border-slate-200">
                            <div className="text-xs font-bold text-slate-600 mb-2">Performance Breakdown</div>
                            <div className="space-y-1">
                              <div className="flex justify-between text-xs">
                                <span>Model Call Duration</span>
                                <span className="font-mono">{profile.waterfall.modelCallEnd - profile.waterfall.modelCallStart}ms</span>
                              </div>
                              <div className="flex justify-between text-xs">
                                <span>Total Execution Time</span>
                                <span className="font-mono">{profile.waterfall.actionExecution - profile.waterfall.apiServerHit}ms</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                  </div>
                ))}
              </div>
              
              {performanceProfiles.length > 0 && (
                <div className="mt-4 pt-4 border-t border-slate-200">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-slate-600">
                      Showing last {performanceProfiles.length} runs
                    </span>
                    <button
                      onClick={() => setPerformanceProfiles([])}
                      className="px-3 py-1 bg-red-500 text-white rounded-lg text-sm font-bold hover:bg-red-600 transition-colors"
                    >
                      Clear History
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

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
