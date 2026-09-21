"use client"

import { useCallback, useRef, useState } from "react"
import { MoveHorizontal } from "lucide-react"

type BeforeAfterSliderProps = {
  beforeSrc: string
  afterSrc: string
}

export function BeforeAfterSlider({ beforeSrc, afterSrc }: BeforeAfterSliderProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState(50)
  const draggingRef = useRef(false)

  const updateFromClientX = useCallback((clientX: number) => {
    const el = containerRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const pct = ((clientX - rect.left) / rect.width) * 100
    setPosition(Math.min(100, Math.max(0, pct)))
  }, [])

  return (
    <div
      ref={containerRef}
      className="relative w-full touch-none select-none overflow-hidden rounded-2xl border border-border bg-muted"
      onPointerDown={(e) => {
        draggingRef.current = true
        e.currentTarget.setPointerCapture(e.pointerId)
        updateFromClientX(e.clientX)
      }}
      onPointerMove={(e) => {
        if (draggingRef.current) updateFromClientX(e.clientX)
      }}
      onPointerUp={() => {
        draggingRef.current = false
      }}
    >
      {/* After (base layer) */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={afterSrc || "/placeholder.svg"} alt="Gevel met zonwering" className="block w-full object-cover" />

      {/* Before (clipped overlay) */}
      <div className="absolute inset-0 overflow-hidden" style={{ width: `${position}%` }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={beforeSrc || "/placeholder.svg"}
          alt="Gevel zonder zonwering"
          className="block h-full max-w-none object-cover"
          style={{ width: containerRef.current ? containerRef.current.offsetWidth : "100%" }}
        />
      </div>

      {/* Labels */}
      <span className="absolute left-3 top-3 rounded-md bg-background/85 px-2 py-1 text-xs font-semibold text-foreground backdrop-blur-sm">
        Voor
      </span>
      <span className="absolute right-3 top-3 rounded-md bg-brand px-2 py-1 text-xs font-semibold text-brand-foreground">
        Na
      </span>

      {/* Handle */}
      <div className="absolute inset-y-0" style={{ left: `${position}%`, transform: "translateX(-50%)" }}>
        <div className="relative h-full w-0.5 bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.1)]">
          <div className="absolute left-1/2 top-1/2 flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-background text-foreground shadow-lg">
            <MoveHorizontal className="h-4 w-4" aria-hidden="true" />
          </div>
        </div>
      </div>

      <label className="sr-only" htmlFor="ba-range">
        Vergelijk voor en na
      </label>
      <input
        id="ba-range"
        type="range"
        min={0}
        max={100}
        value={position}
        onChange={(e) => setPosition(Number(e.target.value))}
        className="sr-only"
      />
    </div>
  )
}
