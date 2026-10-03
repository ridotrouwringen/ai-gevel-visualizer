import { NextResponse } from "next/server";
import sharp from "sharp";

export const maxDuration = 120;

const ROBOFLOW_WORKFLOW =
  "kozijn-detectie-vkozijn-detectie-2-rfdetr-small-t1-logic";

type Detection = {
  x: number;
  y: number;
  width: number;
  height: number;
  confidence?: number;
};

type AnyRecord = Record<string, unknown>;

function isBox(value: unknown): value is Detection {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const v = value as AnyRecord;
  return (
    typeof v.x === "number" &&
    typeof v.y === "number" &&
    typeof v.width === "number" &&
    typeof v.height === "number" &&
    Number.isFinite(v.x) &&
    Number.isFinite(v.y) &&
    Number.isFinite(v.width) &&
    Number.isFinite(v.height) &&
    v.width > 0 &&
    v.height > 0
  );
}

function collectPredictionObjects(value: unknown, found: Detection[] = [], seen = new Set<unknown>()) {
  if (!value || typeof value !== "object" || seen.has(value)) return found;
  seen.add(value);

  if (Array.isArray(value)) {
    for (const item of value) {
      if (isBox(item)) found.push(item);
      else collectPredictionObjects(item, found, seen);
    }
    return found;
  }

  const object = value as AnyRecord;
  if (isBox(object)) {
    found.push(object);
    return found;
  }

  // Roboflow Workflows normally exposes:
  // outputs[0].predictions.predictions
  // but workflow versions can wrap that object differently. Only recurse
  // through prediction-named fields so image metadata is never mistaken for a box.
  for (const [key, child] of Object.entries(object)) {
    if (key.toLowerCase().includes("prediction")) {
      collectPredictionObjects(child, found, seen);
    }
  }

  return found;
}

function extractPredictions(rfJson: unknown): Detection[] {
  const root = rfJson as AnyRecord | null;
  const result = root?.result as AnyRecord | undefined;
  const outputs = result?.outputs;

  if (Array.isArray(outputs)) {
    for (const output of outputs) {
      const direct = (output as AnyRecord | null)?.predictions;
      const predictions = collectPredictionObjects(direct);
      if (predictions.length) return predictions;
    }
  }

  return collectPredictionObjects(result);
}

function extractImageInfo(rfJson: unknown): { width?: number; height?: number } {
  const root = rfJson as AnyRecord | null;
  const result = root?.result as AnyRecord | undefined;
  const outputs = result?.outputs;

  if (!Array.isArray(outputs)) return {};

  for (const output of outputs) {
    const o = output as AnyRecord | null;
    const predictionContainer = o?.predictions as AnyRecord | undefined;
    const image =
      (predictionContainer?.image as AnyRecord | undefined) ??
      (o?.image as AnyRecord | undefined);

    if (
      image &&
      typeof image.width === "number" &&
      typeof image.height === "number" &&
      image.width > 0 &&
      image.height > 0
    ) {
      return { width: image.width, height: image.height };
    }
  }

  return {};
}

export async function POST(req: Request) {
  try {
    const contentType = req.headers.get("content-type") ?? "";
    let image: string | null = null;

    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("image");
      if (file instanceof File) {
        const bytes = Buffer.from(await file.arrayBuffer());
        image = `data:${file.type || "image/png"};base64,${bytes.toString("base64")}`;
      }
    } else {
      const body = await req.json();
      image = typeof body?.image === "string" ? body.image : null;
    }

    if (!image) {
      return NextResponse.json({ error: "Afbeelding ontbreekt." }, { status: 400 });
    }

    const apiKey = process.env.ROBOFLOW_API_KEY ?? process.env.ROBOFLOW_API_TOKEN;
    if (!apiKey) {
      return NextResponse.json(
        { error: "ROBOFLOW_API_KEY ontbreekt." },
        { status: 500 }
      );
    }

    const comma = image.indexOf(",");
    const base64 = comma >= 0 ? image.slice(comma + 1) : image;

    const rf = await fetch(
      `https://serverless.roboflow.com/gevels/workflows/${ROBOFLOW_WORKFLOW}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: apiKey,
          inputs: { image: { type: "base64", value: base64 } },
        }),
      }
    );

    const rfJson = await rf.json();

    if (!rf.ok) {
      return NextResponse.json(
        { error: rfJson?.error ?? "Roboflow detectie mislukt." },
        { status: rf.status }
      );
    }

    const metadata = await sharp(Buffer.from(base64, "base64")).metadata();
    const originalWidth = Number(metadata.width ?? 0);
    const originalHeight = Number(metadata.height ?? 0);

    if (!originalWidth || !originalHeight) {
      return NextResponse.json(
        { error: "De afmetingen van de gevel foto konden niet worden bepaald." },
        { status: 400 }
      );
    }

    const imageInfo = extractImageInfo(rfJson);
    const rfWidth = imageInfo.width ?? originalWidth;
    const rfHeight = imageInfo.height ?? originalHeight;
    const scaleX = originalWidth / rfWidth;
    const scaleY = originalHeight / rfHeight;

    const predictions = extractPredictions(rfJson);

    const boxes: Detection[] = predictions.map((p) => ({
      x: p.x * scaleX,
      y: p.y * scaleY,
      width: p.width * scaleX,
      height: p.height * scaleY,
      confidence: typeof p.confidence === "number" ? p.confidence : undefined,
    }));

    // Roboflow returns object-detection boxes, not pixel masks.
    // We create rectangular raster masks only to keep the existing selection
    // pipeline compatible. SAM3 is deliberately not called.
    const selectedMasks = boxes.map((box) => {
      const left = Math.max(0, Math.floor(box.x - box.width / 2));
      const top = Math.max(0, Math.floor(box.y - box.height / 2));
      const right = Math.min(originalWidth, Math.ceil(box.x + box.width / 2));
      const bottom = Math.min(originalHeight, Math.ceil(box.y + box.height / 2));
      const width = Math.max(1, right - left);
      const height = Math.max(1, bottom - top);

      return {
        data: Array(width * height).fill(255),
        width,
        height,
        offsetX: left,
        offsetY: top,
      };
    });

    const output = (rfJson?.result?.outputs?.[0] ?? {}) as AnyRecord;

    return NextResponse.json({
      ok: true,
      boxes,
      maskCount: selectedMasks.length,
      selectedMasks,
      imageWidth: originalWidth,
      imageHeight: originalHeight,
      source: "roboflow-only-detection-boxes",
      segmentationType: "bounding-box",
      message: boxes.length
        ? `${boxes.length} kozijn(en) gevonden door Roboflow.`
        : "Roboflow gaf 0 kozijnen terug; de API-aanroep is wel geslaagd.",
      providerOutputKeys: Object.keys(output),
      roboflowImageSize: { width: rfWidth, height: rfHeight },
      coordinateScale: { x: scaleX, y: scaleY },
    });
  } catch (error) {
    console.error("Roboflow kozijnherkenning:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Onbekende segmentatiefout." },
      { status: 500 }
    );
  }
}
