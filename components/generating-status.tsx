"use client"

import { useEffect, useState } from "react"
import { Loader2 } from "lucide-react"

const STEPS = [
  "Gevel analyseren…",
  "Ramen scannen…",
  "Zonwering monteren…",
  "Kleuren renderen…",
  "HD-visualisatie afronden…",
]

export function GeneratingStatus() {
  const [index, setIndex] = useState(0)

  useEffect(() => {
    const timer = setInterval(() => {
      setIndex((prev) => (prev < STEPS.length - 1 ? prev + 1 : prev))
    }, 900)
    return () => clearInterval(timer)
  }, [])

  return (
    <div className="flex flex-col items-center gap-4 py-8">
      <div className="inline-flex items-center gap-2.5 rounded-full border border-brand/30 bg-brand/10 px-4 py-2 text-sm font-medium text-brand-foreground">
        <Loader2 className="h-4 w-4 animate-spin text-brand" aria-hidden="true" />
        <span aria-live="polite">{STEPS[index]}</span>
      </div>
      <div className="flex w-full max-w-xs items-center gap-1.5">
        {STEPS.map((_, i) => (
          <div
            key={i}
            className={`h-1.5 flex-1 rounded-full transition-colors ${i <= index ? "bg-brand" : "bg-border"}`}
          />
        ))}
      </div>
    </div>
  )
}
