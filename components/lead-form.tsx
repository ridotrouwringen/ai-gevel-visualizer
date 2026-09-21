"use client"

import { useState } from "react"
import { CheckCircle2, Sparkles } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export function LeadForm() {
  const [submitted, setSubmitted] = useState(false)

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSubmitted(true)
    toast.success("Bedankt! We sturen je HD-foto en richtprijs zo snel mogelijk.")
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <div className="grid gap-0 md:grid-cols-5">
        <div className="bg-brand/10 p-6 md:col-span-2 md:p-8">
          <div className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-brand px-2.5 py-1 text-xs font-semibold text-brand-foreground">
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            Gratis &amp; vrijblijvend
          </div>
          <h3 className="text-balance text-xl font-semibold tracking-tight text-foreground">
            Ontvang de haarscherpe HD-foto &amp; vrijblijvende richtprijs
          </h3>
          <p className="mt-2 text-pretty text-sm text-muted-foreground">
            We renderen jouw gevel in maximale kwaliteit en sturen een indicatieve prijs op maat.
          </p>
        </div>

        <div className="p-6 md:col-span-3 md:p-8">
          {submitted ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 py-6 text-center">
              <CheckCircle2 className="h-10 w-10 text-brand" aria-hidden="true" />
              <p className="text-base font-semibold text-foreground">Aanvraag ontvangen</p>
              <p className="max-w-sm text-sm text-muted-foreground">
                Je HD-visualisatie en richtprijs zijn onderweg naar je inbox.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Naam</Label>
                <Input id="name" name="name" placeholder="Voor- en achternaam" required autoComplete="name" />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="email">E-mailadres</Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    placeholder="jij@voorbeeld.nl"
                    required
                    autoComplete="email"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Telefoonnummer</Label>
                  <Input
                    id="phone"
                    name="phone"
                    type="tel"
                    placeholder="06 12 34 56 78"
                    required
                    autoComplete="tel"
                  />
                </div>
              </div>
              <Button type="submit" size="lg" className="w-full bg-brand text-brand-foreground hover:bg-brand/90">
                Stuur mij de HD-foto &amp; richtprijs
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                We nemen binnen 1 werkdag contact op. Geen verplichtingen.
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
