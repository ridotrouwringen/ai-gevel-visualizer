import { NextResponse } from "next/server";

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

function collectMasks(value: unknown, out: Mask[] = []): Mask[] {
  if (!value || typeof value !== "object") return out;
  if (Array.isArray(value)) { value.forEach((v) => collectMasks(v, out)); return out; }
  const o = value as Record<string, unknown>;
  const masks = o.masks as any;
  const offsets = (o.masks_offset ?? o.mask_offsets) as any;
  if (Array.isArray(masks) && Array.isArray(offsets) && Array.isArray(masks[0])) {
    const count = masks.length, height = masks[0]?.length ?? 0, width = masks[0]?.[0]?.length ?? 0;
    for (let i=0;i<count;i++) {
      const flat = (masks[i] as unknown[]).flat(Infinity).map(Number);
      if (flat.length === width*height && offsets[i*2] !== undefined) {
        out.push({data:flat.map(v=>v>0?255:0),width,height,offsetX:Number(offsets[i*2]),offsetY:Number(offsets[i*2+1])});
      }
    }
  }
  for (const key of ["output","results","predictions","masks"]) collectMasks(o[key], out);
  return out;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const image = body?.image;
    if (typeof image !== "string") return NextResponse.json({error:"Afbeelding ontbreekt."},{status:400});

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
    const iw = Number(imageInfo?.width ?? 0), ih = Number(imageInfo?.height ?? 0);

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
