import { NextResponse } from "next/server";

export const maxDuration = 120;

const SAM3_VERSION =
  "vufinder/sam3:1bf97763d5dfd3a1584adca913a8ef4b43c684fca97e04e39e4c50a3a5e09650";

type Point = { x: number; y: number };
type Box = [number, number, number, number];

function isNumberArray(value: unknown, length: number) {
  return (
    Array.isArray(value) &&
    value.length >= length &&
    value.slice(0, length).every((n) => typeof n === "number")
  );
}

function collectBoxes(value: unknown, output: Box[] = []): Box[] {
  if (!value || typeof value !== "object") return output;

  if (Array.isArray(value)) {
    for (const item of value) collectBoxes(item, output);
    return output;
  }

  const object = value as Record<string, unknown>;

  for (const key of ["bbox", "box", "bounding_box", "boundingBox"]) {
    const candidate = object[key];
    if (isNumberArray(candidate, 4)) {
      output.push([
        Number(candidate[0]),
        Number(candidate[1]),
        Number(candidate[2]),
        Number(candidate[3]),
      ]);
    }
  }

  for (const key of [
    "boxes",
    "detections",
    "instances",
    "predictions",
    "results",
    "masks",
  ]) {
    collectBoxes(object[key], output);
  }

  return output;
}

function pointInBox(point: Point, box: Box) {
  const [a, b, c, d] = box;

  // Support both xyxy and cxcywh style boxes.
  const xyxyInside = point.x >= a && point.x <= c && point.y >= b && point.y <= d;
  if (xyxyInside) return true;

  const halfW = c / 2;
  const halfH = d / 2;
  return (
    point.x >= a - halfW &&
    point.x <= a + halfW &&
    point.y >= b - halfH &&
    point.y <= b + halfH
  );
}

function boxArea(box: Box) {
  const [a, b, c, d] = box;
  return Math.abs(c * d) > 0 ? Math.abs(c * d) : Math.abs((c - a) * (d - b));
}

function normaliseBox(box: Box): Box {
  const [a, b, c, d] = box;

  // If this looks like normalized xyxy, keep it.
  if (
    a >= 0 &&
    a <= 1 &&
    b >= 0 &&
    b <= 1 &&
    c >= 0 &&
    c <= 1 &&
    d >= 0 &&
    d <= 1 &&
    c >= a &&
    d >= b
  ) {
    return [a, b, c, d];
  }

  // Otherwise assume xyxy pixels and normalize by the largest plausible extent.
  // The frontend primarily needs this as metadata; the actual mask remains the
  // authoritative SAM output.
  const maxValue = Math.max(Math.abs(a), Math.abs(b), Math.abs(c), Math.abs(d), 1);
  return [a / maxValue, b / maxValue, c / maxValue, d / maxValue];
}

function buildKozijnBox(boxes: Box[], point: Point): Box | null {
  if (!boxes.length) return null;

  const candidates = boxes
    .map(normaliseBox)
    .filter((box) => pointInBox(point, box))
    .sort((a, b) => boxArea(a) - boxArea(b));

  if (!candidates.length) return null;

  // The smallest box containing the click is the clicked visual segment.
  // We expose it separately; the complete kozijn is reconstructed from the
  // returned SAM masks in the next client-side step.
  return candidates[0];
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
              // The user clicks inside a window. We explicitly ask SAM3 to
              // interpret the clicked visual object as a complete window frame /
              // window assembly rather than a single glass pane.
              text: "window frame",
              positive_points: [[x, y]],
            }),
          ],
          confidence_threshold: 0.35,
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
    const visualizationUrls: string[] = Array.isArray(output?.visualizations)
      ? output.visualizations.filter((value: unknown): value is string => typeof value === "string")
      : [];
    const resultUrls: string[] = Array.isArray(output?.results)
      ? output.results.filter((value: unknown): value is string => typeof value === "string")
      : [];

    const results: unknown[] = [];

    for (const resultUrl of resultUrls) {
      try {
        const resultResponse = await fetch(resultUrl);
        if (resultResponse.ok) {
          results.push(await resultResponse.json());
        }
      } catch {
        // Keep processing the other result files.
      }
    }

    const boxes = results.flatMap((result) => collectBoxes(result));
    const clickedBox = buildKozijnBox(boxes, { x, y });

    return NextResponse.json({
      ok: true,
      prompt: {
        text: "window frame",
        point: { x, y },
      },
      visualizationUrl: visualizationUrls[0] ?? null,
      visualizationUrls,
      resultUrl: resultUrls[0] ?? null,
      resultUrls,
      boxes,
      clickedBox,
      point: { x, y },
      // The raw result URLs are deliberately returned so we can inspect and
      // convert the actual SAM masks into one kozijn mask in the next step.
      message:
        "SAM3 heeft het klikpunt als window frame geïnterpreteerd. De volgende stap is het groeperen van bij elkaar horende ruiten tot één kozijncontour.",
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
