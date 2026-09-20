import { SiteHeader } from "@/components/site-header"
import { Visualizer } from "@/components/visualizer"
import { Toaster } from "@/components/ui/sonner"

export default function Page() {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main>
        <Visualizer />
      </main>
      <footer className="border-t border-border/70 py-8">
        <div className="mx-auto max-w-6xl px-4 text-center text-xs text-muted-foreground sm:px-6">
          AI Gevel Visualizer &middot; Zonwering op maat &middot; Alle visualisaties zijn indicatief
        </div>
      </footer>
      <Toaster position="top-center" richColors />
    </div>
  )
}
