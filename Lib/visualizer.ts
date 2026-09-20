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
  { id: "raam-1", label: "Raam 1", x: 27, y: 33, product: "zip-screen", frameColor: "#383E42", fabricColor: "#3A3D40" },
  { id: "raam-2", label: "Raam 2", x: 50, y: 33, product: "zip-screen", frameColor: "#383E42", fabricColor: "#3A3D40" },
  { id: "raam-3", label: "Raam 3", x: 73, y: 33, product: "zip-screen", frameColor: "#383E42", fabricColor: "#3A3D40" },
  { id: "terras", label: "Terras", x: 50, y: 74, product: "knikarmscherm", frameColor: "#383E42", fabricColor: "#C9B79C" },
]

export function productLabel(value: ProductType) {
  return PRODUCTS.find((p) => p.value === value)?.label ?? value
}
