"use client"
import type React from "react"
import { motion } from "framer-motion"
import { useInView } from "framer-motion"
import { useRef } from "react"

interface SlideProps {
  children: React.ReactNode
  className?: string
}

export function SlideSection({ children, className = "" }: SlideProps) {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true, margin: "-100px" })

  return (
    <section ref={ref} className={`min-h-screen flex items-center justify-center px-6 ${className}`}>
      <motion.div
        initial={{ opacity: 0, y: 50 }}
        animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 50 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className="max-w-5xl mx-auto text-center"
      >
        {children}
      </motion.div>
    </section>
  )
}

export function Slide1() {
  return (
    <SlideSection className="bg-white text-slate-900">
      <div className="space-y-12">
        {/* Supporting Context */}
        <div className="space-y-6 text-slate-600">
          <p className="text-2xl md:text-3xl font-light">Everyone has grandparents.</p>
          <p className="text-2xl md:text-3xl font-light">Most of them struggle with tech.</p>
        </div>

        {/* Main Punchline */}
        <div className="space-y-8">
          <h2 className="text-4xl md:text-6xl font-black leading-tight">
            With Orgo and <span className="inde-text">Inde</span>,<br />
            AI becomes their
            <br />
            <span className="text-5xl md:text-7xl">digital superpower</span>
          </h2>

          <div className="bg-slate-900 text-white p-8 rounded-2xl border-4 border-slate-900">
            <p className="text-2xl md:text-4xl font-bold">
              <span className="inde-text">Inde</span>pendence.
              <br />
              <span className="text-slate-300 font-normal text-xl md:text-2xl">Tech fluency without tech skills.</span>
            </p>
          </div>
        </div>
      </div>
    </SlideSection>
  )
}

export function Slide2() {
  return (
    <SlideSection className="bg-slate-900 text-white">
      <div className="space-y-12">
        {/* Header */}
        <h2 className="text-3xl md:text-4xl font-bold text-slate-400 uppercase tracking-wider">Our Mission</h2>

        {/* Main Punchline */}
        <div className="space-y-8">
          <h3 className="text-5xl md:text-7xl font-black leading-tight">
            Empower anyone to be
            <br />
            <span className="inde-text">inde</span>pendent
            <br />
            on any computer
          </h3>

          <div className="bg-white text-slate-900 p-8 rounded-2xl border-4 border-white">
            <p className="text-xl md:text-2xl font-medium">
              No hand-holding. No bottlenecks.
              <br />
              <span className="font-black text-2xl md:text-3xl">Just confidence.</span>
            </p>
          </div>
        </div>
      </div>
    </SlideSection>
  )
}

export function Slide3() {
  return (
    <SlideSection className="bg-yellow-400 text-slate-900">
      <div className="space-y-12">
        {/* Scenario Setup */}
        <h2 className="text-4xl md:text-5xl font-black">
          Say you're setting up
          <br />a complex stack:
        </h2>

        {/* Supporting Details */}
        <div className="bg-slate-900 text-white p-8 rounded-2xl border-4 border-slate-900">
          <div className="space-y-4 text-xl md:text-2xl font-medium">
            <p>→ Installing API keys</p>
            <p>→ Deploying a Next.js site</p>
            <p>→ Connecting to countless services</p>
          </div>
        </div>

        {/* Main Punchline */}
        <div className="space-y-6">
          <h3 className="text-3xl md:text-5xl font-black leading-tight">
            What if you could just ask AI:
            <br />
            <span className="inde-text">"Do this—and teach me how"</span>
          </h3>
          <p className="text-2xl md:text-3xl font-bold">At your pace. On your terms.</p>
        </div>
      </div>
    </SlideSection>
  )
}

export function Slide4() {
  return (
    <SlideSection className="bg-red-500 text-white">
      <div className="space-y-12">
        {/* Scenario Setup */}
        <h2 className="text-4xl md:text-5xl font-black">
          New job?
          <br />
          Onboarding overload:
        </h2>

        {/* Supporting Details */}
        <div className="bg-white text-slate-900 p-8 rounded-2xl border-4 border-white">
          <div className="space-y-4 text-xl md:text-2xl font-medium">
            <p>→ Watch 100 tool demos</p>
            <p>→ Retain 1</p>
            <p>→ Ask about the other 99... again and again</p>
          </div>
        </div>

        {/* Main Punchline */}
        <div className="space-y-6">
          <h3 className="text-3xl md:text-5xl font-black leading-tight">
            With <span className="inde-text">Inde</span>, AI demos
            <br />
            internal tools on demand
          </h3>
          <p className="text-2xl md:text-3xl font-bold">Any role. Any experience level. Any speed.</p>
        </div>
      </div>
    </SlideSection>
  )
}

export function Slide5() {
  return (
    <SlideSection className="bg-green-500 text-slate-900">
      <div className="space-y-12">
        {/* Main Definition */}
        <h2 className="text-4xl md:text-6xl font-black leading-tight">
          <span className="inde-text">Inde</span> means guided,
          <br />
          intelligent computer use
        </h2>

        {/* Supporting Context */}
        <div className="bg-slate-900 text-white p-8 rounded-2xl border-4 border-slate-900">
          <p className="text-2xl md:text-3xl font-bold">
            For anyone, anywhere,
            <br />
            with any background
          </p>
        </div>

        {/* Punchline */}
        <div className="space-y-6">
          <p className="text-2xl md:text-3xl font-medium">The possibilities? Endless.</p>
          <h3 className="text-4xl md:text-6xl font-black">
            The result?
            <br />
            True <span className="inde-text">inde</span>pendence.
          </h3>
        </div>
      </div>
    </SlideSection>
  )
}

export function Slide6() {
  return (
    <SlideSection className="bg-slate-900 text-white">
      <div className="space-y-12">
        {/* Build Up */}
        <h2 className="text-3xl md:text-4xl font-medium text-slate-300">Let's make the world not just smarter—</h2>

        {/* Main CTA */}
        <h3 className="text-5xl md:text-8xl font-black leading-tight">
          Let's make it
          <br />
          <span className="inde-text">Inde</span>pendent.
        </h3>

        <button className="mt-12 px-16 py-6 bg-white text-slate-900 rounded-2xl font-black text-2xl md:text-3xl hover:bg-slate-100 transition-colors border-4 border-white">
          Get Started
        </button>
      </div>
    </SlideSection>
  )
}
