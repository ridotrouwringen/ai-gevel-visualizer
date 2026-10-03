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

    const apiKey = process.env.ROBOFLOW_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "ROBOFLOW_API_KEY ontbreekt." }, { status: 500 });
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

    const predictions =
      rfJson?.result?.outputs?.[0]?.predictions?.predictions ?? [];
    const imageInfo = rfJson?.result?.outputs?.[0]?.predictions?.image;
    const metadata = await sharp(Buffer.from(base64, "base64")).metadata();
    const imageWidth = Number(imageInfo?.width ?? metadata.width ?? 0);
    const imageHeight = Number(imageInfo?.height ?? metadata.height ?? 0);

    if (!imageWidth || !imageHeight) {
      return NextResponse.json(
        { error: "De afmetingen van de gevel foto konden niet worden bepaald." },
        { status: 400 }
      );
    }

    const boxes: Detection[] = predictions
      .filter((p: any) =>
        p && [p.x, p.y, p.width, p.height].every((n: any) => typeof n === "number")
      )
      .map((p: any) => ({
        x: p.x,
        y: p.y,
        width: p.width,
        height: p.height,
        confidence: typeof p.confidence === "number" ? p.confidence : undefined,
      }));

    // SAM 3 is intentionally not called. The active selection is derived only
    // from Roboflow's returned detections. This workflow currently returns
    // bounding boxes, not native pixel-level segmentation masks.
    const selectedMasks = boxes.map((box) => {
      const left = Math.max(0, Math.floor(box.x - box.width / 2));
      const top = Math.max(0, Math.floor(box.y - box.height / 2));
      const right = Math.min(imageWidth, Math.ceil(box.x + box.width / 2));
      const bottom = Math.min(imageHeight, Math.ceil(box.y + box.height / 2));
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

    return NextResponse.json({
      ok: true,
      boxes,
      maskCount: selectedMasks.length,
      selectedMasks,
      imageWidth,
      imageHeight,
      source: "roboflow-only-detection-boxes",
      segmentationType: "bounding-box",
      message: "SAM 3 uitgeschakeld. Alleen Roboflow-detectiekaders worden gebruikt; dit zijn geen pixelmaskers.",
    });
  } catch (error) {
    console.error("Roboflow kozijnherkenning:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Onbekende segmentatiefout." },
      { status: 500 }
    );
  }
}
