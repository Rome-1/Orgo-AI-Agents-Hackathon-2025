"use client"
import { useState, useEffect } from "react"
import { motion } from "framer-motion"

export function HeroSection() {
  const [showFullTitle, setShowFullTitle] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => {
      setShowFullTitle(true)
    }, 1000)
    return () => clearTimeout(timer)
  }, [])

  const scrollToDemo = () => {
    document.getElementById("demo")?.scrollIntoView({ behavior: "smooth" })
  }

  return (
    <section className="min-h-screen bg-slate-950 flex items-center justify-center px-6">
      <motion.div
        initial={{ opacity: 0, y: 50 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{
          delay: 0.3,
          duration: 0.8,
          ease: "easeInOut",
        }}
        className="text-center"
      >
        <h1 className="text-5xl md:text-8xl font-black tracking-tight mb-16">
          <motion.span
            initial={{ opacity: 0 }}
            animate={{ opacity: showFullTitle ? 1 : 0 }}
            transition={{ duration: 0.8, ease: "easeInOut" }}
            className="text-white"
          >
            Organic{" "}
          </motion.span>
          <span className="inde-text">Inde</span>
          <motion.span
            initial={{ opacity: 0 }}
            animate={{ opacity: showFullTitle ? 1 : 0 }}
            transition={{ duration: 0.8, ease: "easeInOut" }}
            className="text-white"
          >
            pendence
          </motion.span>
        </h1>

        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: showFullTitle ? 0.6 : 0 }}
          transition={{ delay: 0.5, duration: 0.8 }}
          onClick={scrollToDemo}
          className="px-4 py-2 text-slate-400 text-sm border border-slate-600 rounded-md hover:text-slate-300 hover:border-slate-500 transition-all duration-300"
        >
          Skip to Demo ↓
        </motion.button>
      </motion.div>
    </section>
  )
}
