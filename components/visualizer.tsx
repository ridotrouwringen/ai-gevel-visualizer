'use client'

import { useMemo, useState } from "react"
import { RotateCcw, Sparkles, Wand2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { UploadCard } from "@/components/upload-card"
import { FacadeCanvas } from "@/components/facade-canvas"
import { ConfigPanel } from "@/components/config-panel"
import { GeneratingStatus } from "@/components/generating-status"
import { BeforeAfterSlider } from "@/components/before-after-slider"
import { LeadForm } from "@/components/lead-form"
import { DEFAULT_SPOTS, productLabel, type WindowSpot } from "@/lib/visualizer"

type Stage = "upload" | "configure" | "generating" | "result"

export function Visualizer() {
  const [stage, setStage] = useState<Stage>("upload")
  const [image, setImage] = useState<string | null>(null)
  const [spots, setSpots] = useState<WindowSpot[]>(DEFAULT_SPOTS)
  
  const [selectedIds, setSelectedIds] = useState<string[]>(DEFAULT_SPOTS.map((s) => s.id))
  const [activeId, setActiveId] = useState<string | null>(DEFAULT_SPOTS[0]?.id ?? null)
  const [applyToAll, setApplyToAll] = useState(false)

  const activeSpot = useMemo(() => spots.find((s) => s.id === activeId) ?? spots[0] ?? null, [spots, activeId])

  function handleUpload(dataUrl: string) {
    setImage(dataUrl)
    setSpots(DEFAULT_SPOTS)
    const initialIds = DEFAULT_SPOTS.map((s) => s.id)
    setSelectedIds(initialIds)
    setActiveId(initialIds[0] ?? null)
    setStage("configure")
  }

  function handleToggleWindow(id: string) {
    setSelectedIds((prev) => {
      const isSelected = prev.includes(id)
      const updated = isSelected ? prev.filter((item) => item !== id) : [...prev, id]
      if (isSelected && activeId === id) {
        setActiveId(updated[0] ?? null)
      } else if (!isSelected) {
        setActiveId(id)
      }
      return updated
    })
  }

  function handleSelectAll() {
    setSelectedIds(spots.map((s) => s.id))
  }

  function handleDeselectAll() {
    setSelectedIds([])
  }

  function handleUpdate(patch: Partial<WindowSpot>) {
    setSpots((prev) =>
      prev.map((s) => {
        if (applyToAll || selectedIds.includes(s.id)) {
          return { ...s, ...patch }
        }
        return s.id === activeId ? { ...s, ...patch } : s
      }),
    )
  }

  function handleGenerate() {
    setStage("generating")
    setTimeout(() => setStage("result"), 4600)
  }

  function handleReset() {
    setStage("upload")
    setImage(null)
    setSpots(DEFAULT_SPOTS)
    setSelectedIds(DEFAULT_SPOTS.map((s) => s.id))
    setActiveId(DEFAULT_SPOTS[0]?.id ?? null)
    setApplyToAll(false)
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto mb-10 max-w-2xl text-center">
        <Badge className="mb-4 gap-1.5 bg-brand/15 text-brand-foreground hover:bg-brand/15">
          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
          AI-visualisatie voor zonwering
        </Badge>
        <h1 className="text-balance text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          Zie je zonwering vóór je koopt
        </h1>
        <p className="mt-3 text-pretty text-base text-muted-foreground">
          Upload een foto van je gevel, kies je product en kleuren, en ontvang een realistische visualisatie met richtprijs.
        </p>
      </div>

      {stage === "upload" && <UploadCard onUpload={handleUpload} />}

      {(stage === "configure" || stage === "generating") && image && (
        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          <div className="space-y-4">
            <FacadeCanvas
              src={image}
              spots={spots}
              selectedIds={selectedIds}
              onToggle={handleToggleWindow}
              onSelectAll={handleSelectAll}
              onDeselectAll={handleDeselectAll}
            />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Button variant="ghost" size="sm" onClick={handleReset} className="gap-2 text-muted-foreground cursor-pointer">
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
                Andere foto
              </Button>
              <p className="text-xs text-muted-foreground">
                {spots.length} zones gedetecteerd &middot; {selectedIds.length} geselecteerd
              </p>
            </div>

            {stage === "generating" && (
              <Card className="p-2">
                <GeneratingStatus />
              </Card>
            )}
          </div>

          <div className="lg:sticky lg:top-20 lg:self-start">
            <Card className="p-5">
              <ConfigPanel
                spot={activeSpot}
                applyToAll={applyToAll}
                onApplyToAllChange={setApplyToAll}
                onUpdate={handleUpdate}
              />
              <Button
                size="lg"
                onClick={handleGenerate}
                disabled={stage === "generating" || selectedIds.length === 0}
                className="mt-6 w-full gap-2 bg-brand text-brand-foreground hover:bg-brand/90 disabled:opacity-50 cursor-pointer"
              >
                <Wand2 className="h-4.5 w-4.5" aria-hidden="true" />
                {selectedIds.length === 0 ? "Selecteer minimaal 1 raam" : "Genereer Visualisatie"}
              </Button>
            </Card>
          </div>
        </div>
      )}

      {stage === "result" && image && (
        <div className="space-y-8">
          <div className="mx-auto max-w-4xl space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-2xl font-semibold tracking-tight text-foreground">Jouw visualisatie is klaar</h2>
                <p className="text-sm text-muted-foreground">Sleep de slider om voor en na te vergelijken.</p>
              </div>
              <Button variant="outline" size="sm" onClick={handleReset} className="gap-2 bg-transparent cursor-pointer">
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
                Opnieuw beginnen
              </Button>
            </div>
            <BeforeAfterSlider beforeSrc={image} afterSrc="/facade-after.png" />
            <div className="flex flex-wrap gap-2">
              {spots
                .filter((spot) => selectedIds.includes(spot.id))
                .map((spot) => (
                  <span
                    key={spot.id}
                    className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs text-foreground"
                  >
                    <span
                      className="h-3 w-3 rounded-full border border-black/10"
                      style={{ backgroundColor: spot.frameColor }}
                      aria-hidden="true"
                    />
                    {spot.label}: {productLabel(spot.product)}
                  </span>
                ))}
            </div>
          </div>

          <div className="mx-auto max-w-4xl">
            <LeadForm />
          </div>
        </div>
      )}
    </div>
  )
}