import { NextResponse } from "next/server";

export const maxDuration = 120;

const SAM3_VERSION =
  "vufinder/sam3:1bf97763d5dfd3a1584adca913a8ef4b43c684fca97e04e39e4c50a3a5e09650";

function findBoundingBox(value: unknown): [number, number, number, number] | null {
  if (!value || typeof value !== "object") return null;

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findBoundingBox(item);
      if (found) return found;
    }
    return null;
  }

  const object = value as Record<string, unknown>;

  for (const key of ["bbox", "box", "bounding_box", "boundingBox"]) {
    const candidate = object[key];
    if (
      Array.isArray(candidate) &&
      candidate.length >= 4 &&
      candidate.slice(0, 4).every((n) => typeof n === "number")
    ) {
      return [
        Number(candidate[0]),
        Number(candidate[1]),
        Number(candidate[2]),
        Number(candidate[3]),
      ];
    }
  }

  for (const key of ["boxes", "detections", "instances", "predictions", "results"]) {
    const found = findBoundingBox(object[key]);
    if (found) return found;
  }

  return null;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const image = body?.image;
    const point = body?.point;

    if (
      typeof image !== "string" ||
      !point ||
      typeof point.x !== "number" ||
      typeof point.y !== "number"
    ) {
      return NextResponse.json(
        { error: "Afbeelding en klikpositie zijn verplicht." },
        { status: 400 }
      );
    }

    const apiKey = process.env.REPLICATE_API_TOKEN;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Replicate API Key ontbreekt in de Vercel kluis." },
        { status: 500 }
      );
    }

    const x = Math.max(0, Math.min(1, point.x));
    const y = Math.max(0, Math.min(1, point.y));

    const response = await fetch("https://api.replicate.com/v1/predictions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Prefer: "wait",
      },
      body: JSON.stringify({
        version: SAM3_VERSION,
        input: {
          image,
          prompts: [
            JSON.stringify({
              positive_points: [[x, y]],
            }),
          ],
          confidence_threshold: 0.5,
          visualize: true,
          offset_masks: true,
          split_output: true,
        },
      }),
    });

    const prediction = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        {
          error:
            prediction?.detail ||
            prediction?.error ||
            "SAM 3 segmentatie mislukt.",
        },
        { status: response.status }
      );
    }

    if (prediction?.status === "failed") {
      return NextResponse.json(
        { error: prediction?.error || "SAM 3 segmentatie mislukt." },
        { status: 502 }
      );
    }

    const output = prediction?.output;
    const visualizationUrl = output?.visualizations?.[0] ?? null;
    const resultUrl = output?.results?.[0] ?? null;

    let result: unknown = null;
    if (resultUrl) {
      try {
        const resultResponse = await fetch(resultUrl);
        if (resultResponse.ok) {
          result = await resultResponse.json();
        }
      } catch {
        // The visualization is still useful if the result JSON cannot be read.
      }
    }

    const bbox = findBoundingBox(result);

    return NextResponse.json({
      ok: true,
      visualizationUrl,
      resultUrl,
      bbox,
      point: { x, y },
    });
  } catch (error) {
    console.error("SAM 3 route error", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Onbekende fout tijdens SAM 3 segmentatie.",
      },
      { status: 500 }
    );
  }
}
