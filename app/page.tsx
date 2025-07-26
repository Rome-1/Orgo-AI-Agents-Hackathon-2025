import { HeroSection } from "@/components/hero-section"
import { Slide1, Slide2, Slide3, Slide4, Slide5, Slide6 } from "@/components/slide-section"
import { DemoSection } from "@/components/demo-section"

export default function Home() {
  return (
    <main className="overflow-x-hidden">
      <HeroSection />
      <Slide1 />
      <Slide2 />
      <Slide3 />
      <Slide4 />
      <Slide5 />
      <Slide6 />
      <DemoSection />
    </main>
  )
}
