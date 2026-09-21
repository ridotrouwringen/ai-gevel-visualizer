"use client"

import { cn } from "@/lib/utils"
import type { WindowSpot } from "@/lib/visualizer"
import { CheckSquare, Square, CheckCircle2, Circle } from "lucide-react"

type FacadeCanvasProps = {
  src: string
  spots: WindowSpot[]
  selectedIds: string[]
  onToggle: (id: string) => void
  onSelectAll: () => void
  onDeselectAll: () => void
}

export function FacadeCanvas({
  src,
  spots,
  selectedIds = [],
  onToggle,
  onSelectAll,
  onDeselectAll,
}: FacadeCanvasProps) {
  const allSelected = spots.length > 0 && selectedIds.length === spots.length
  const someSelected = selectedIds.length > 0

  return (
    <div className="flex w-full flex-col gap-3">
      {/* Actiebalk met snel-selectie knoppen */}
      {spots.length > 0 && (
        <div className="flex items-center justify-between rounded-xl border border-border bg-muted/60 p-2.5 text-xs font-medium">
          <span className="text-muted-foreground">
            <strong className="text-foreground">{spots.length}</strong> {spots.length === 1 ? "raam" : "ramen"} gedetecteerd 
            ({selectedIds.length} geselecteerd)
          </span>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onSelectAll}
              disabled={allSelected}
              className="flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 font-semibold text-foreground shadow-sm transition hover:bg-accent disabled:opacity-50 cursor-pointer"
            >
              <CheckSquare className="h-3.5 w-3.5 text-primary" />
              Selecteer alles
            </button>
            <button
              type="button"
              onClick={onDeselectAll}
              disabled={!someSelected}
              className="flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 font-semibold text-foreground shadow-sm transition hover:bg-accent disabled:opacity-50 cursor-pointer"
            >
              <Square className="h-3.5 w-3.5 text-muted-foreground" />
              Wis selectie
            </button>
          </div>
        </div>
      )}

      {/* Gevel Canvas Container */}
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl border border-border bg-muted flex items-center justify-center">
        {/* 1. Aangepast naar object-contain voor perfecte schaling */}
        <img 
          src={src || "/placeholder.svg"} 
          alt="Geüploade gevel" 
          className="h-full w-full object-contain pointer-events-none select-none" 
        />

        {/* Dynamic Badges & Kaders */}
        <div className="pointer-events-auto absolute inset-0">
          {spots.map((spot, i) => {
            const isSelected = selectedIds.includes(spot.id)
            const hasBounds = spot.width !== undefined && spot.height !== undefined

            return (
              <div
                key={spot.id}
                style={{
                  left: `${spot.x}%`,
                  top: `${spot.y}%`,
                  ...(hasBounds ? { width: `${spot.width}%`, height: `${spot.height}%` } : {}),
                }}
                onClick={() => onToggle(spot.id)}
                className={cn(
                  "absolute transition-all cursor-pointer",
                  hasBounds 
                    ? cn("border-2 rounded-md", isSelected ? "border-primary bg-primary/20 shadow-md" : "border-amber-400/80 bg-amber-400/10 hover:border-amber-400")
                    : "-translate-x-1/2 -translate-y-1/2"
                )}
              >
                {/* 2. Badge verankerd met vinkje */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    onToggle(spot.id)
                  }}
                  className={cn(
                    "flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold shadow-lg backdrop-blur-sm transition-all whitespace-nowrap cursor-pointer",
                    hasBounds ? "absolute -bottom-8 left-1/2 -translate-x-1/2" : "",
                    isSelected
                      ? "scale-105 border-primary bg-primary text-primary-foreground ring-2 ring-primary/30"
                      : "border-white/70 bg-background/90 text-foreground hover:border-primary/60"
                  )}
                  aria-label={`Selecteer ${spot.label || `Raam ${i + 1}`}`}
                  aria-pressed={isSelected}
                >
                  {isSelected ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-primary-foreground" />
                  ) : (
                    <Circle className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                  <span>{spot.label || `Raam ${i + 1}`}</span>
                </button>
              </div>
            )
          })}
        </div>

        <div className="pointer-events-none absolute bottom-3 left-3 rounded-lg bg-background/85 px-2.5 py-1 text-xs text-muted-foreground backdrop-blur-sm">
          Klik op de ramen om een of meerdere te selecteren
        </div>
      </div>
    </div>
  )
}
