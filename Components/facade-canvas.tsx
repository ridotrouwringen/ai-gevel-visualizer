"use client"

import { cn } from "@/lib/utils"
import type { WindowSpot } from "@/lib/visualizer"

type FacadeCanvasProps = {
  src: string
  spots: WindowSpot[]
  activeId: string | null
  onSelect: (id: string) => void
}

export function FacadeCanvas({ src, spots, activeId, onSelect }: FacadeCanvasProps) {
  return (
    <div className="relative w-full overflow-hidden rounded-2xl border border-border bg-muted">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src || "/placeholder.svg"} alt="Geüploade gevel" className="block w-full object-cover" />

      <div className="pointer-events-none absolute inset-0">
        {spots.map((spot, i) => {
          const active = spot.id === activeId
          return (
            <button
              key={spot.id}
              type="button"
              onClick={() => onSelect(spot.id)}
              style={{ left: `${spot.x}%`, top: `${spot.y}%` }}
              className={cn(
                "pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 rounded-full outline-none transition-all focus-visible:ring-2 focus-visible:ring-ring",
              )}
              aria-label={`Selecteer ${spot.label}`}
              aria-pressed={active}
            >
              <span
                className={cn(
                  "flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-semibold shadow-lg backdrop-blur-sm transition-all",
                  active
                    ? "scale-105 border-brand bg-brand text-brand-foreground"
                    : "border-white/70 bg-background/85 text-foreground hover:border-brand/60",
                )}
              >
                <span
                  className={cn(
                    "flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold",
                    active ? "bg-brand-foreground/15 text-brand-foreground" : "bg-brand/15 text-brand-foreground",
                  )}
                >
                  {i + 1}
                </span>
                {spot.label}
              </span>
            </button>
          )
        })}
      </div>

      <div className="pointer-events-none absolute bottom-3 left-3 rounded-lg bg-background/85 px-2.5 py-1 text-xs text-muted-foreground backdrop-blur-sm">
        Tik op een badge om het raam te configureren
      </div>
    </div>
  )
}
