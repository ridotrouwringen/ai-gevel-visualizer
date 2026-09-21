"use client"

import { Check } from "lucide-react"
import { cn } from "@/lib/utils"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Separator } from "@/components/ui/separator"
import {
  PRODUCTS,
  FRAME_COLORS,
  FABRIC_COLORS,
  type WindowSpot,
  type ProductType,
  type ColorOption,
} from "@/lib/visualizer"

type ConfigPanelProps = {
  spot: WindowSpot | null
  applyToAll: boolean
  onApplyToAllChange: (value: boolean) => void
  onUpdate: (patch: Partial<WindowSpot>) => void
}

export function ConfigPanel({ spot, applyToAll, onApplyToAllChange, onUpdate }: ConfigPanelProps) {
  if (!spot) {
    return (
      <div className="flex h-full min-h-40 items-center justify-center rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        Selecteer een raam of terras op de foto om te configureren.
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Configuratie</p>
          <h3 className="text-lg font-semibold tracking-tight text-foreground">{spot.label}</h3>
        </div>
      </div>

      {/* Product type */}
      <div className="space-y-3">
        <Label className="text-sm font-medium">Producttype</Label>
        <div className="grid gap-2">
          {PRODUCTS.map((product) => {
            const selected = spot.product === product.value
            return (
              <button
                key={product.value}
                type="button"
                onClick={() => onUpdate({ product: product.value as ProductType })}
                className={cn(
                  "flex items-center justify-between rounded-xl border p-3 text-left transition-all",
                  selected
                    ? "border-brand bg-brand/10 ring-1 ring-brand/40"
                    : "border-border bg-card hover:border-brand/50 hover:bg-accent/40",
                )}
                aria-pressed={selected}
              >
                <span>
                  <span className="block text-sm font-semibold text-foreground">{product.label}</span>
                  <span className="block text-xs text-muted-foreground">{product.description}</span>
                </span>
                <span
                  className={cn(
                    "flex h-5 w-5 items-center justify-center rounded-full border transition-colors",
                    selected ? "border-brand bg-brand text-brand-foreground" : "border-border",
                  )}
                >
                  {selected && <Check className="h-3.5 w-3.5" aria-hidden="true" />}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      <Separator />

      {/* Frame color */}
      <ColorGroup
        title="Kleur kozijn / kast"
        colors={FRAME_COLORS}
        value={spot.frameColor}
        onChange={(hex) => onUpdate({ frameColor: hex })}
        showRal
      />

      {/* Fabric color */}
      <ColorGroup
        title="Kleur doek"
        colors={FABRIC_COLORS}
        value={spot.fabricColor}
        onChange={(hex) => onUpdate({ fabricColor: hex })}
      />

      <Separator />

      {/* Apply to all */}
      <div className="flex items-start justify-between gap-4 rounded-xl border border-border bg-card p-4">
        <div className="space-y-0.5">
          <Label htmlFor="apply-all" className="text-sm font-medium">
            Pas toe op alle ramen
          </Label>
          <p className="text-xs text-muted-foreground">Gebruik deze instellingen voor de hele gevel.</p>
        </div>
        <Switch id="apply-all" checked={applyToAll} onCheckedChange={onApplyToAllChange} />
      </div>
    </div>
  )
}

function ColorGroup({
  title,
  colors,
  value,
  onChange,
  showRal = false,
}: {
  title: string
  colors: ColorOption[]
  value: string
  onChange: (hex: string) => void
  showRal?: boolean
}) {
  const current = colors.find((c) => c.hex === value)
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">{title}</Label>
        {current && (
          <span className="text-xs text-muted-foreground">
            {showRal ? `${current.ral} ${current.name}` : current.name}
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {colors.map((color) => {
          const selected = color.hex === value
          return (
            <button
              key={color.id}
              type="button"
              onClick={() => onChange(color.hex)}
              title={showRal ? `${color.ral} ${color.name}` : color.name}
              aria-label={showRal ? `${color.ral} ${color.name}` : color.name}
              aria-pressed={selected}
              className={cn(
                "relative h-11 w-11 rounded-xl border shadow-sm outline-none transition-transform focus-visible:ring-2 focus-visible:ring-ring",
                selected ? "scale-105 ring-2 ring-brand ring-offset-2 ring-offset-background" : "hover:scale-105",
              )}
              style={{ backgroundColor: color.hex, borderColor: "rgba(0,0,0,0.15)" }}
            >
              {selected && (
                <Check
                  className="absolute inset-0 m-auto h-4 w-4"
                  style={{ color: isLight(color.hex) ? "#111" : "#fff" }}
                  aria-hidden="true"
                />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function isLight(hex: string) {
  const c = hex.replace("#", "")
  const r = Number.parseInt(c.substring(0, 2), 16)
  const g = Number.parseInt(c.substring(2, 4), 16)
  const b = Number.parseInt(c.substring(4, 6), 16)
  return (r * 299 + g * 587 + b * 114) / 1000 > 150
}
