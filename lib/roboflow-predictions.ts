export type RoboflowPrediction = {
  x: number;
  y: number;
  width: number;
  height: number;
  confidence?: number;
  class?: string;
};

function normalizePredictions(value: unknown): RoboflowPrediction[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    .map((item) => ({
      x: Number(item.x),
      y: Number(item.y),
      width: Number(item.width),
      height: Number(item.height),
      confidence: typeof item.confidence === "number" ? item.confidence : undefined,
      class: typeof item.class === "string" ? item.class : undefined,
    }))
    .filter(
      (item) =>
        Number.isFinite(item.x) &&
        Number.isFinite(item.y) &&
        Number.isFinite(item.width) &&
        Number.isFinite(item.height) &&
        item.width > 0 &&
        item.height > 0
    );
}

export function extractRoboflowPredictions(payload: unknown): RoboflowPrediction[] {
  const root = payload as Record<string, unknown> | null;
  const result = root?.result as Record<string, unknown> | undefined;
  const outputs = result?.outputs;

  if (!Array.isArray(outputs)) return [];

  const output = outputs[0] as Record<string, unknown> | undefined;
  const predictionContainer = output?.predictions as Record<string, unknown> | undefined;

  return normalizePredictions(predictionContainer?.predictions);
}
