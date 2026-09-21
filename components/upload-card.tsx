"use client"

import { useRef, useState } from "react"
import { UploadCloud, ImageIcon, ShieldCheck } from "lucide-react"
import { cn } from "@/lib/utils"

type UploadCardProps = {
  onUpload: (dataUrl: string) => void
}

export function UploadCard({ onUpload }: UploadCardProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  function handleFiles(files: FileList | null) {
    const file = files?.[0]
    if (!file || !file.type.startsWith("image/")) return
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === "string") onUpload(reader.result)
    }
    reader.readAsDataURL(file)
  }

  return (
    <div className="mx-auto w-full max-w-2xl">
      <div
        role="button"
        tabIndex={0}
        aria-label="Upload een foto van je gevel"
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault()
            inputRef.current?.click()
          }
        }}
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          handleFiles(e.dataTransfer.files)
        }}
        className={cn(
          "group flex cursor-pointer flex-col items-center justify-center rounded-3xl border-2 border-dashed bg-card px-6 py-14 text-center transition-all",
          "hover:border-brand/60 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          dragging ? "border-brand bg-accent/60 scale-[1.01]" : "border-border",
        )}
      >
        <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-brand/15 text-brand transition-transform group-hover:scale-105">
          <UploadCloud className="h-8 w-8" aria-hidden="true" />
        </div>
        <h2 className="text-balance text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
          Upload een foto van je voor- of achtergevel
        </h2>
        <p className="mt-2 max-w-md text-pretty text-sm text-muted-foreground">
          Sleep je foto hierheen of klik om te bladeren. Maak de foto recht van voren voor het beste resultaat.
        </p>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <ImageIcon className="h-3.5 w-3.5" aria-hidden="true" />
            JPG, PNG of HEIC
          </span>
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
            Veilig &amp; vrijblijvend
          </span>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>

      <button
        type="button"
        onClick={() => onUpload("/facade-before.png")}
        className="mx-auto mt-4 block text-sm font-medium text-brand-foreground underline-offset-4 hover:underline"
      >
        Geen foto bij de hand? Probeer een voorbeeldgevel
      </button>
    </div>
  )
}
