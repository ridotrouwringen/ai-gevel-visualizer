import { NextResponse } from "next/server";
import sharp from "sharp";

export const maxDuration = 120;

const SAM3_VERSION =
  "vufinder/sam3:1bf97763d5dfd3a1584adca913a8ef4b43c684fca97e04e39e4c50a3a5e09650";

type Box = { cx: number; cy: number; w: number; h: number; confidence?: number };
type Mask = { data: number[]; width: number; height: number; offsetX: number; offsetY: number };

function collectBoxes(value: unknown, out: Box[] = []): Box[] {
  if (!value || typeof value !== "object") return out;
  if (Array.isArray(value)) {
    if (value.length >= 4 && value.slice(0, 4).every((n) => typeof n === "number")) {
      const [a,b,c,d] = value as number[];
      if (c > 0 && d > 0) {
        out.push(a <= 1 && b <= 1 && c <= 1 && d <= 1
          ? { cx:a, cy:b, w:c, h:d }
          : { cx:a, cy:b, w:c, h:d });
        return out;
      }
    }
    value.forEach((v) => collectBoxes(v, out));
    return out;
  }
  const o = value as Record<string, unknown>;
  const p = o.predictions;
  if (Array.isArray(p)) {
    for (const item of p) {
      if (item && typeof item === "object") {
        const q = item as Record<string, unknown>;
        if ([q.x,q.y,q.width,q.height].every((n) => typeof n === "number")) {
          out.push({
            cx: Number(q.x) / 1000,
            cy: Number(q.y) / 1000,
            w: Number(q.width) / 1000,
            h: Number(q.height) / 1000,
            confidence: typeof q.confidence === "number" ? q.confidence : undefined,
          });
        }
      }
    }
  }
  for (const key of ["boxes","detections","results","output"]) collectBoxes(o[key], out);
  return out;
}

function flattenValues(value: unknown): number[] | null {
  if (!Array.isArray(value)) return null;
  const out: number[] = [];
  for (const item of value) {
    if (Array.isArray(item)) {
      const nested = flattenValues(item);
      if (!nested) return null;
      out.push(...nested);
    } else if (typeof item === "number" || typeof item === "boolean") {
      out.push(typeof item === "boolean" ? (item ? 1 : 0) : item);
    } else {
      return null;
    }
  }
  return out;
}

function arrayShape(value: unknown): number[] {
  const shape: number[] = [];
  let current = value;
  while (Array.isArray(current)) {
    shape.push(current.length);
    current = current[0];
  }
  return shape;
}

function readMaskArray(value: unknown): { data: number[]; shape: number[] } | null {
  if (Array.isArray(value)) {
    const data = flattenValues(value);
    return data ? { data, shape: arrayShape(value) } : null;
  }
  if (value && typeof value === "object") {
    const o = value as Record<string, unknown>;
    const raw = o.data ?? o.values ?? o.array;
    const data = flattenValues(raw);
    const shape = Array.isArray(o.shape)
      ? o.shape.filter((n): n is number => typeof n === "number")
      : [];
    return data && shape.length ? { data, shape } : null;
  }
  return null;
}

function collectMasks(value: unknown, out: Mask[] = []): Mask[] {
  if (!value || typeof value !== "object") return out;
  if (Array.isArray(value)) {
    value.forEach((v) => collectMasks(v, out));
    return out;
  }

  const o = value as Record<string, unknown>;
  const masks = readMaskArray(o.masks);
  const offsets = readMaskArray(o.masks_offset ?? o.mask_offsets);

  if (masks && offsets && masks.shape.length >= 3) {
    const width = masks.shape[masks.shape.length - 1];
    const height = masks.shape[masks.shape.length - 2];
    const pixelsPerMask = width * height;
    const count = Math.floor(masks.data.length / pixelsPerMask);
    if (width > 0 && height > 0 && count > 0 && offsets.data.length >= count * 2) {
      for (let i = 0; i < count; i++) {
        out.push({
          data: masks.data.slice(i * pixelsPerMask, (i + 1) * pixelsPerMask).map((v) => v > 0 ? 255 : 0),
          width,
          height,
          offsetX: Number(offsets.data[i * 2]),
          offsetY: Number(offsets.data[i * 2 + 1]),
        });
      }
    }
  }

  for (const key of ["output", "results", "predictions", "mask", "masks"]) {
    if (o[key] !== o.masks) collectMasks(o[key], out);
  }
  return out;
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
        const mime = file.type || "image/png";
        image = `data:${mime};base64,${bytes.toString("base64")}`;
      }
    } else {
      const body = await req.json();
      image = typeof body?.image === "string" ? body.image : null;
    }

    if (typeof image !== "string") {
      return NextResponse.json({ error: "Afbeelding ontbreekt." }, { status: 400 });
    }

    const rfKey = process.env.ROBOFLOW_API_KEY;
    const replicateKey = process.env.REPLICATE_API_TOKEN;
    if (!rfKey) return NextResponse.json({error:"ROBOFLOW_API_KEY ontbreekt."},{status:500});
    if (!replicateKey) return NextResponse.json({error:"REPLICATE_API_TOKEN ontbreekt."},{status:500});

    const comma = image.indexOf(",");
    const base64 = comma >= 0 ? image.slice(comma + 1) : image;

    const rf = await fetch(
      "https://serverless.roboflow.com/gevels/workflows/kozijn-detectie-vkozijn-detectie-2-rfdetr-small-t1-logic",
      {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({api_key:rfKey,inputs:{image:{type:"base64",value:base64}}})
      }
    );
    const rfJson = await rf.json();
    if (!rf.ok) return NextResponse.json({error:rfJson?.error ?? "Roboflow detectie mislukt."},{status:rf.status});

    const predictions = rfJson?.result?.outputs?.[0]?.predictions?.predictions ?? [];
    const imageInfo = rfJson?.result?.outputs?.[0]?.predictions?.image;
    let iw = Number(imageInfo?.width ?? 0);
    let ih = Number(imageInfo?.height ?? 0);
    if (!iw || !ih) {
      const metadata = await sharp(Buffer.from(base64, "base64")).metadata();
      iw = Number(metadata.width ?? 0);
      ih = Number(metadata.height ?? 0);
    }
    if (!iw || !ih) {
      return NextResponse.json({ error: "De afmetingen van de gevel foto konden niet worden bepaald." }, { status: 400 });
    }

    // Roboflow currently supplies detection boxes. Those boxes are proposals only.
    // SAM3 is then used once, in the same request, to turn every proposal into
    // an actual pixel mask. This prevents the detection rectangle from becoming
    // the final product geometry.
    const boxes: Box[] = predictions
      .filter((p:any) => p && [p.x,p.y,p.width,p.height].every((n:any)=>typeof n==="number"))
      .map((p:any) => ({
        cx: p.x / Math.max(1, iw),
        cy: p.y / Math.max(1, ih),
        w: p.width / Math.max(1, iw),
        h: p.height / Math.max(1, ih),
        confidence: typeof p.confidence === "number" ? p.confidence : undefined
      }));

    if (!boxes.length) {
      return NextResponse.json({ok:true, boxes:[], selectedMasks:[], message:"Roboflow vond geen kozijnen."});
    }

    const sam = await fetch("https://api.replicate.com/v1/predictions", {
      method:"POST",
      headers:{Authorization:`Bearer ${replicateKey}`,"Content-Type":"application/json",Prefer:"wait"},
      body:JSON.stringify({
        version:SAM3_VERSION,
        input:{
          image,
          prompts:[JSON.stringify({
            text:"window frame",
            positive_boxes: boxes.map(b=>[b.cx,b.cy,b.w,b.h])
          })],
          confidence_threshold:0.35,
          visualize:false,
          offset_masks:true,
          split_output:true
        }
      })
    });
    const samJson = await sam.json();
    if (!sam.ok || samJson?.status === "failed") {
      return NextResponse.json({error:samJson?.detail ?? samJson?.error ?? "Kozijnsegmentatie mislukt."},{status:502});
    }

    const urls = Array.isArray(samJson?.output?.results) ? samJson.output.results.filter((x:any)=>typeof x==="string") : [];
    const resultObjects:any[] = [];
    for (const url of urls) {
      const response = await fetch(url);
      if (response.ok) resultObjects.push(await response.json());
    }
    const masks = collectMasks(resultObjects);
    return NextResponse.json({
      ok:true,
      boxes,
      maskCount:masks.length,
      selectedMasks:masks.map(m=>m),
      imageWidth:iw,
      imageHeight:ih,
      source:"roboflow-detection + sam3-pixel-segmentation"
    });
  } catch (error) {
    console.error("Roboflow/SAM segmentatie:",error);
    return NextResponse.json({error:error instanceof Error?error.message:"Onbekende segmentatiefout."},{status:500});
  }
}
