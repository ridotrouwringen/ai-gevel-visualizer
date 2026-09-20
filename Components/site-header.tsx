import { Sun } from "lucide-react"

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-border/70 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand text-brand-foreground shadow-sm">
            <Sun className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="leading-tight">
            <p className="text-base font-semibold tracking-tight text-foreground">AI Gevel Visualizer</p>
            <p className="text-xs text-muted-foreground">Zonwering op maat, direct in beeld</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <nav className="hidden items-center gap-6 text-sm text-muted-foreground sm:flex">
            <span className="cursor-default transition-colors hover:text-foreground">Producten</span>
            <span className="cursor-default transition-colors hover:text-foreground">Werkwijze</span>
            <span className="cursor-default transition-colors hover:text-foreground">Contact</span>
          </nav>
          <div
            className="flex h-9 items-center rounded-lg border border-dashed border-border px-3 text-xs font-medium text-muted-foreground"
            aria-label="Logo van uw bedrijf"
          >
            Uw logo
          </div>
        </div>
      </div>
    </header>
  )
}
