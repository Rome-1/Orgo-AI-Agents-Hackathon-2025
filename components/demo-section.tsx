"use client"
import { useState } from "react"
import { motion } from "framer-motion"

export function DemoSection() {
  const [isLoading, setIsLoading] = useState(false)
  const [hasImage, setHasImage] = useState(false)
  const [speed, setSpeed] = useState(50)
  const [inputText, setInputText] = useState("")

  const handleLaunchInde = async () => {
    setIsLoading(true)
    try {
      const response = await fetch("/api/demo/launch")
      if (response.ok) {
        setHasImage(true)
      }
    } catch (error) {
      console.error("Error launching Inde:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const handlePlay = async () => {
    try {
      await fetch(`/api/demo/play?speed=${speed}`)
    } catch (error) {
      console.error("Error playing demo:", error)
    }
  }

  const handleForward = async () => {
    try {
      await fetch(`/api/demo/forward?speed=${speed}`)
    } catch (error) {
      console.error("Error forwarding demo:", error)
    }
  }

  const handleReset = async () => {
    try {
      await fetch("/api/demo/reset")
      setHasImage(false)
    } catch (error) {
      console.error("Error resetting demo:", error)
    }
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
                  src="/placeholder.svg?height=400&width=600&text=Inde+Interface"
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
                className="w-14 h-14 bg-green-500 text-white rounded-xl flex items-center justify-center hover:bg-green-600 transition-colors font-bold text-xl border-2 border-green-600"
              >
                ▶
              </button>
              <button
                onClick={handleForward}
                className="w-14 h-14 inde-bg text-white rounded-xl flex items-center justify-center hover:opacity-90 transition-opacity font-bold text-lg border-2 border-blue-600"
              >
                {">>"}
              </button>
              <button
                onClick={handleReset}
                className="w-14 h-14 bg-red-500 text-white rounded-xl flex items-center justify-center hover:bg-red-600 transition-colors font-bold text-xl border-2 border-red-600"
              >
                ↻
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
              />
              <span className="text-slate-900 font-bold text-lg min-w-[3rem] text-center bg-white px-3 py-1 rounded-lg border-2 border-slate-300">
                {speed}
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
