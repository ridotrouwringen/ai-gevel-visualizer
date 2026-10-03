import { NextResponse } from "next/server";

const ROBOFLOW_WORKSPACE = "gevels";
const ROBOFLOW_WORKFLOW =
  "kozijn-detectie-vkozijn-detectie-2-rfdetr-small-t1-logic";

type Prediction = {
  x: number;
  y: number;
  width: number;
  height: number;
  confidence?: number;
  class?: string;
};

function normalizePredictions(value: unknown): Prediction[] {
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

export function extractRoboflowPredictions(payload: unknown): Prediction[] {
  const root = payload as Record<string, unknown> | null;
  const result = root?.result as Record<string, unknown> | undefined;
  const outputs = result?.outputs;

  if (!Array.isArray(outputs)) return [];

  const output = outputs[0] as Record<string, unknown> | undefined;
  const predictionContainer = output?.predictions as Record<string, unknown> | undefined;

  return normalizePredictions(predictionContainer?.predictions);
}

export async function POST(request: Request) {
  try {
    const apiKey = process.env.ROBOFLOW_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: "ROBOFLOW_API_KEY ontbreekt in Vercel Environment Variables." },
        { status: 500 }
      );
    }

    const formData = await request.formData();
    const image = formData.get("image");

    if (!(image instanceof File)) {
      return NextResponse.json(
        { error: "Stuur een afbeelding mee als form-data veld 'image'." },
        { status: 400 }
      );
    }

    const bytes = await image.arrayBuffer();
    const base64 = Buffer.from(bytes).toString("base64");

    // This is deliberately the same Roboflow request that was working in main.
    const response = await fetch(
      `https://serverless.roboflow.com/${ROBOFLOW_WORKSPACE}/workflows/${ROBOFLOW_WORKFLOW}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: apiKey,
          inputs: {
            image: {
              type: "base64",
              value: base64,
            },
          },
        }),
      }
    );

    const result = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        {
          error:
            result?.error ||
            result?.message ||
            `Roboflow gaf HTTP ${response.status} terug.`,
        },
        { status: response.status }
      );
    }

    const predictions = extractRoboflowPredictions(result);

    // Keep the original Roboflow center/width/height coordinates. The browser
    // canvas uses the uploaded image's natural dimensions, exactly as main did.
    const boxes = predictions.map((prediction) => ({
      x: prediction.x,
      y: prediction.y,
      width: prediction.width,
      height: prediction.height,
      confidence: prediction.confidence ?? 0,
      class: prediction.class,
    }));

    // Rectangular masks are compatibility data for the existing selection
    // pipeline. They are not claimed to be pixel segmentation.
    const imageInfo =
      ((result as any)?.result?.outputs?.[0]?.predictions?.image as
        | { width?: number; height?: number }
        | undefined) ?? null;

    const selectedMasks =
      imageInfo?.width && imageInfo?.height
        ? boxes.map((box) => {
            const left = Math.max(0, Math.floor(box.x - box.width / 2));
            const top = Math.max(0, Math.floor(box.y - box.height / 2));
            const right = Math.min(imageInfo.width!, Math.ceil(box.x + box.width / 2));
            const bottom = Math.min(imageInfo.height!, Math.ceil(box.y + box.height / 2));
            const width = Math.max(1, right - left);
            const height = Math.max(1, bottom - top);
            return {
              data: Array(width * height).fill(255),
              width,
              height,
              offsetX: left,
              offsetY: top,
            };
          })
        : [];

    return NextResponse.json({
      ok: true,
      boxes,
      selectedMasks,
      maskCount: selectedMasks.length,
      imageWidth: imageInfo?.width ?? null,
      imageHeight: imageInfo?.height ?? null,
      segmentationType: "bounding-box",
      source: "roboflow-main-compatible",
      message: boxes.length
        ? `Roboflow: ${boxes.length} kozijn(en) gevonden.`
        : "Roboflow gaf 0 kozijnen terug.",
    });
  } catch (error) {
    console.error("Roboflow kozijn detectie:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Onbekende fout bij Roboflow detectie.",
      },
      { status: 500 }
    );
  }
}
