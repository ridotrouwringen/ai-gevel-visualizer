export type ProductType = "zip-screen" | "rolluik" | "knikarmscherm"

export type ColorOption = {
  id: string
  name: string
  ral: string
  hex: string
}

export type WindowSpot = {
  id: string
  label: string
  /** Position as percentage of the image (top-left origin) */
  x: number
  y: number
  width?: number
  height?: number
  product: ProductType
  frameColor: string
  fabricColor: string
}

export const PRODUCTS: { value: ProductType; label: string; description: string }[] = [
  { value: "zip-screen", label: "Zip-screen", description: "Strak, windvast doekscherm" },
  { value: "rolluik", label: "Rolluik", description: "Isolatie & inbraakwering" },
  { value: "knikarmscherm", label: "Knikarmscherm", description: "Terrasscherm met arm" },
]

export const FRAME_COLORS: ColorOption[] = [
  { id: "ral7016", name: "Antraciet", ral: "RAL 7016", hex: "#383E42" },
  { id: "ral9010", name: "Wit", ral: "RAL 9010", hex: "#F1F0EA" },
  { id: "ral9005", name: "Zwart", ral: "RAL 9005", hex: "#0A0A0D" },
  { id: "ral9006", name: "Zilver", ral: "RAL 9006", hex: "#A5A5A5" },
]

export const FABRIC_COLORS: ColorOption[] = [
  { id: "f-antraciet", name: "Antraciet", ral: "Doek", hex: "#3A3D40" },
  { id: "f-zand", name: "Zand", ral: "Doek", hex: "#C9B79C" },
  { id: "f-grijs", name: "Grijs", ral: "Doek", hex: "#8A8D90" },
  { id: "f-wit", name: "Gebroken wit", ral: "Doek", hex: "#E7E3D8" },
]

export const DEFAULT_SPOTS: WindowSpot[] = [
  { id: "raam-1", label: "Raam 1", x: 20, y: 25, width: 18, height: 28, product: "zip-screen", frameColor: "RAL 7016 Antraciet", fabricColor: "Antraciet" },
  { id: "raam-2", label: "Raam 2", x: 41, y: 25, width: 18, height: 28, product: "zip-screen", frameColor: "RAL 7016 Antraciet", fabricColor: "Antraciet" },
  { id: "raam-3", label: "Raam 3", x: 62, y: 25, width: 18, height: 28, product: "zip-screen", frameColor: "RAL 7016 Antraciet", fabricColor: "Antraciet" },
  { id: "terras", label: "Terras", x: 41, y: 65, width: 40, height: 25, product: "knikarmscherm", frameColor: "RAL 7016 Antraciet", fabricColor: "Zand" },
]

export function productLabel(value: ProductType) {
  return PRODUCTS.find((p) => p.value === value)?.label ?? value
}

/**
  Bouwt de strikte prompt voor Gemini om de originele gevel te behouden
  en zonwering op álle geselecteerde ramen tegelijk te plaatsen.
 */
export function buildGeminiPrompt(selectedSpots: WindowSpot[]): string {
  const spotDetails = selectedSpots
    .map(
      (spot, idx) =>
        `- Location ${idx + 1} (${spot.label}): X=${spot.x}%, Y=${spot.y}%${
          spot.width ? `, Width=${spot.width}\%, Height=${spot.height}%` : ""
        }. Product: ${productLabel(spot.product)}, Casing/Frame color: ${spot.frameColor}, Fabric/Slats color: ${spot.fabricColor}.`
    )
    .join("\n")

  return `
YOU ARE A PROFESSIONAL ARCHITECTURAL VISUALIZER SPECIALIZED IN EXTERIOR SUN PROTECTION.

STRICT INPAINTING & EDITING RULES:
1. DO NOT GENERATE A NEW HOUSE, FACADE, OR BUILDING.
2. KEEP THE ORIGINAL BUILDING, BRICKWORK, WINDOW FRAMES, ROOF, AND SURROUNDING ENVIRONMENT 100% IDENTICAL TO THE SOURCE PHOTO.
3. ONLY MOUNT/ADD THE SPECIFIED SUN PROTECTION PRODUCTS ONTO THE DETECTED WINDOW LOCATIONS ON THE EXISTING FACADE.

TARGET LOCATIONS AND PRODUCTS TO MOUNT:
${spotDetails}

VISUAL REQUIREMENTS:
- Mount the cassette/casing flush against the existing window frames.
- Ensure natural daylighting and soft realistic shadows matching the angle of the original photo.
- Keep the image photorealistic, crisp, and clean.
`.trim()
}
