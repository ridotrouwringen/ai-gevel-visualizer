import type { MaskShape } from "@/types/visualizer";

export type GenerationSelection = Pick<
  MaskShape,
  "id" | "sequenceNumber" | "type" | "coordinates" | "rasterMasks" | "productType" | "systemColor" | "fabricColor"
>;

export function generationInputError(image: unknown, selections: unknown): string | null {
  if (typeof image !== "string" || !Array.isArray(selections) || selections.length === 0) {
    return "Geen afbeelding of selecties gevonden.";
  }

  const invalid = selections.find((selection) => {
    if (!selection || typeof selection !== "object") return true;
    const value = selection as GenerationSelection;
    if (!value.productType || !value.systemColor) return true;
    if (value.type === "LINE") return value.coordinates?.length !== 2;
    return !Array.isArray(value.rasterMasks) || value.rasterMasks.length === 0;
  });

  return invalid ? "Een of meer selecties bevatten geen geldige montagegeometrie." : null;
}
