import { NextResponse } from "next/server";
import Replicate from "replicate";
import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { SYSTEM_COLORS, ZIPSCREEN_FABRICS, AWNING_FABRICS, type FabricColor, type MaskShape, type ProductType, type SystemColor } from "@/types/visualizer";

export const maxDuration = 120;

type RasterMask = NonNullable<MaskShape["rasterMasks"]>[number];
type Selection = Pick<MaskShape, "id" | "sequenceNumber" | "type" | "coordinates" | "rasterMasks" | "productType" | "systemColor" | "fabricColor">;

function dataUriToBuffer(dataUri: string) {
  const match = dataUri.match(/^data:[^;]+;base64,(.+)$/s);
  if (!match) throw new Error("De afbeelding moet een base64 data-URI zijn.");
  return Buffer.from(match[1], "base64");
}

function bufferToDataUri(buffer: Buffer, mime = "image/png") {
  return `data:${mime};base64,${buffer.toString("base64")}`;
}

function colorLabel(id: SystemColor | FabricColor | undefined) {
  if (!id) return "niet gespecificeerd";
  const color = [...SYSTEM_COLORS, ...ZIPSCREEN_FABRICS, ...AWNING_FABRICS].find((item) => item.id === id);
  return color ? `${color.label} (${color.hex})` : id;
}

function productPrompt(
  selection: Selection,
  bounds: { left: number; top: number; right: number; bottom: number }
) {
  const systemColor = colorLabel(selection.systemColor);
  const fabricColor = selection.fabricColor ? colorLabel(selection.fabricColor) : null;
  const region = `left=${bounds.left.toFixed(3)}, top=${bounds.top.toFixed(3)}, right=${bounds.right.toFixed(3)}, bottom=${bounds.bottom.toFixed(3)}`;

  if (selection.productType === "ROLLUIKEN") {
    return `Image 1 is the original facade photo. Image 2 is the exact product reference for the rolluik. Image 3 is a spatial guide: the semi-transparent highlighted region is the ONLY area to modify.

Place ONE SINGLE continuous photorealistic exterior aluminum roller shutter across the ENTIRE highlighted window assembly. Treat the highlighted dormer/erker as ONE opening, even when it contains multiple window panes. Do NOT place separate shutters on individual panes. The rolluik must span the full selected width and full selected height as one product, fully closed, with one continuous top cassette and continuous side guides at the outer edges. Use the product appearance from image 2. System color: ${systemColor}. The selected region in normalized image coordinates is ${region}. Preserve the original architecture, roof, brickwork, window divisions and lighting outside the highlighted region.`;
  }

  if (selection.productType === "ZIPSCREENS") {
    return `Image 1 is the original facade photo. Image 2 is the exact product reference for the zipscreen. Image 3 is a spatial guide: the semi-transparent highlighted region is the ONLY area to modify.

Place ONE SINGLE continuous photorealistic exterior ZIP SCREEN across the ENTIRE highlighted window assembly. Treat the highlighted dormer/erker as ONE opening, even when it contains multiple window panes. Do NOT place separate screens on individual panes. The screen must span the full selected width and full selected height as one product, fully closed, fitted within the selected contour. Use the product appearance from image 2. System color: ${systemColor}. Fabric color: ${fabricColor}. The selected region in normalized image coordinates is ${region}. Preserve the original architecture and everything outside the highlighted region.`;
  }

  return `Image 1 is the original facade photo. Image 2 is the exact product reference for the knikarmscherm. Image 3 is a spatial guide: the semi-transparent highlighted region is the ONLY area to modify.

Place ONE photorealistic folding-arm exterior awning with the fabric fully extended, using the highlighted region as the placement area and the supplied line as the mounting reference. Use the product appearance from image 2. System color: ${systemColor}. Fabric color: ${fabricColor}. Preserve the existing facade and everything outside the highlighted region. The selected region in normalized image coordinates is ${region}.`;
}

function buildLineMask(width: number, height: number, coordinates: { x: number; y: number }[]) {
  const start = coordinates[0], end = coordinates[1];
  const left = Math.max(0, Math.min(start.x, end.x)), right = Math.min(1, Math.max(start.x, end.x));
  const top = Math.max(0, Math.min(start.y, end.y)), bottom = Math.min(1, top + 0.20);
  const x0 = Math.floor(left * width), x1 = Math.ceil(right * width);
  const y0 = Math.floor(top * height), y1 = Math.ceil(bottom * height);
  const data = Buffer.alloc(width * height);
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) data[y * width + x] = 255;
  return data;
}

function buildRasterMask(width: number, height: number, masks: RasterMask[]) {
  const data = Buffer.alloc(width * height);
  for (const mask of masks) {
    for (let y = 0; y < mask.height; y++) {
      const targetY = mask.offsetY + y;
      if (targetY < 0 || targetY >= height) continue;
      for (let x = 0; x < mask.width; x++) {
        const targetX = mask.offsetX + x;
        if (targetX < 0 || targetX >= width) continue;
        if (Number(mask.data[y * mask.width + x] ?? 0) > 0) data[targetY * width + targetX] = 255;
      }
    }
  }
  return data;
}

async function makeMask(width: number, height: number, selection: Selection) {
  const raw = selection.type === "LINE"
    ? buildLineMask(width, height, selection.coordinates)
    : buildRasterMask(width, height, selection.rasterMasks ?? []);
  const png = await sharp(raw, { raw: { width, height, channels: 1 } }).png().toBuffer();
  return { raw, png };
}

function getOutputUrl(output: unknown): string {
  if (typeof output === "string") return output;
  if (Array.isArray(output)) return getOutputUrl(output[0]);
  if (output && typeof output === "object") {
    const value = output as { url?: () => string; href?: string };
    if (typeof value.url === "function") return value.url();
    if (typeof value.href === "string") return value.href;
  }
  throw new Error("Replicate heeft geen geldige afbeeldings-URL teruggegeven.");
}

async function runEdit(
  imageBuffer: Buffer,
  guideBuffer: Buffer,
  referenceBuffer: Buffer,
  prompt: string,
  apiKey: string,
  modelWidth: number,
  modelHeight: number
) {
  const replicate = new Replicate({ auth: apiKey });
  console.log("FLUX.2 Pro starten", {
    imageBytes: imageBuffer.length,
    guideBytes: guideBuffer.length,
    referenceBytes: referenceBuffer.length,
    prompt,
  });

  try {
    const output = await replicate.run("black-forest-labs/flux-2-pro", {
      input: {
        prompt,
        input_images: [imageBuffer, referenceBuffer, guideBuffer],
        aspect_ratio: "match_input_image",
        resolution: "1 MP",
        output_format: "jpg",
        output_quality: 90,
        safety_tolerance: 2,
        prompt_upsampling: false,
      },
    });

    const url = getOutputUrl(output);
    console.log("FLUX.2 Pro klaar");
    return url;
  } catch (error) {
    console.error("FLUX.2 Pro fout:", error);
    throw new Error(error instanceof Error ? `Replicate/FLUX fout: ${error.message}` : "Onbekende Replicate/FLUX fout.");
  }
}

function maskBounds(maskRaw: Buffer, width: number, height: number) {
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (maskRaw[y * width + x] === 0) continue;
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
    }
  }

  if (right < 0) {
    return { left: 0, top: 0, right: 1, bottom: 1 };
  }

  return {
    left: left / width,
    top: top / height,
    right: (right + 1) / width,
    bottom: (bottom + 1) / height,
  };
}

async function makeSelectionGuide(imageBuffer: Buffer, maskRaw: Buffer, width: number, height: number) {
  // A visual guide gives FLUX.2 Pro an explicit spatial reference for the
  // selected region. The guide is never used as the final image: after
  // generation we composite only the exact binary mask onto the original.
  const overlay = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    if (maskRaw[i] > 0) {
      overlay[i * 4] = 255;
      overlay[i * 4 + 1] = 0;
      overlay[i * 4 + 2] = 180;
      overlay[i * 4 + 3] = 90;
    }
  }

  return sharp(imageBuffer)
    .composite([{
      input: overlay,
      raw: { width, height, channels: 4 },
      blend: "over",
    }])
    .png()
    .toBuffer();
}

async function loadProductReference(productType: ProductType) {
  const files: Record<ProductType, string> = {
    ROLLUIKEN: "rolluik.jpg",
    ZIPSCREENS: "zipscreen.jpg",
    KNIKARMSCHERMEN: "knikarmscherm.jpg",
  };

  const filePath = path.join(process.cwd(), "public", "products", files[productType]);
  return readFile(filePath);
}

async function compositeOnlyInsideMask(originalBuffer: Buffer, generatedUrl: string, maskRaw: Buffer, width: number, height: number) {
  const generatedResponse = await fetch(generatedUrl);
  if (!generatedResponse.ok) throw new Error(`Het AI-resultaat kon niet worden opgehaald (HTTP ${generatedResponse.status}).`);
  const generatedBuffer = Buffer.from(await generatedResponse.arrayBuffer());
  const generatedRgba = await sharp(generatedBuffer)
    .resize(width, height, { fit: "fill" })
    .removeAlpha()
    .joinChannel(maskRaw, { raw: { width, height, channels: 1 } })
    .png()
    .toBuffer();
  return sharp(originalBuffer).composite([{ input: generatedRgba, blend: "over" }]).png().toBuffer();
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const image = body?.image;
    const selections = body?.selections as Selection[] | undefined;

    if (typeof image !== "string" || !Array.isArray(selections) || selections.length === 0)
      return NextResponse.json({ error: "Geen afbeelding of selecties gevonden." }, { status: 400 });

    const apiKey = process.env.REPLICATE_API_TOKEN;
    if (!apiKey) return NextResponse.json({ error: "Replicate API Key ontbreekt in de Vercel kluis." }, { status: 500 });

    const invalid = selections.find((selection) => {
      if (!selection.productType || !selection.systemColor) return true;
      if (selection.type === "LINE") return selection.coordinates?.length !== 2;
      return !Array.isArray(selection.rasterMasks) || selection.rasterMasks.length === 0;
    });
    if (invalid) return NextResponse.json({ error: "Een of meer selecties bevatten geen geldige montagegeometrie." }, { status: 400 });

    const originalBuffer = dataUriToBuffer(image);
    const metadata = await sharp(originalBuffer).metadata();
    const width = metadata.width, height = metadata.height;
    if (!width || !height) return NextResponse.json({ error: "Afbeeldingsafmetingen konden niet worden bepaald." }, { status: 400 });

    console.log("Generatie gestart", { imageBytes: originalBuffer.length, width, height, selections: selections.length });

    let currentBuffer = originalBuffer;
    const results: Array<{ id: string; productType: ProductType }> = [];

    for (const selection of selections) {
      const { raw: maskRaw } = await makeMask(width, height, selection);
      const bounds = maskBounds(maskRaw, width, height);
      const guideBuffer = await makeSelectionGuide(currentBuffer, maskRaw, width, height);
      const referenceBuffer = await loadProductReference(selection.productType);

      // FLUX.2 Pro edits the complete image using:
      //   image 1 = current facade
      //   image 2 = exact product reference from the product library
      //   image 3 = visual selection guide
      //
      // The exact binary SAM3 mask is still authoritative for the final
      // composition: only selected pixels from the AI result are copied back.
      const modelMetadata = await sharp(currentBuffer).metadata();
      const sourceWidth = modelMetadata.width ?? width;
      const sourceHeight = modelMetadata.height ?? height;

      const generatedUrl = await runEdit(
        currentBuffer,
        guideBuffer,
        referenceBuffer,
        productPrompt(selection, bounds),
        apiKey,
        sourceWidth,
        sourceHeight
      );

      currentBuffer = await compositeOnlyInsideMask(
        currentBuffer,
        generatedUrl,
        maskRaw,
        width,
        height
      );

      results.push({ id: selection.id, productType: selection.productType });
    }

    return NextResponse.json({
      success: true,
      imageUrl: bufferToDataUri(currentBuffer, "image/png"),
      model: "black-forest-labs/flux-2-pro",
      selectionCount: selections.length,
      results,
      message: "Visualisatie succesvol gegenereerd met masked inpainting.",
    });
  } catch (error: unknown) {
    console.error("Inpainting API Error:", error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Interne serverfout tijdens het genereren.",
    }, { status: 500 });
  }
}
