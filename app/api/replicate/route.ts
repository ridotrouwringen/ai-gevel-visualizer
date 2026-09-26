import { NextResponse } from "next/server";
import Replicate from "replicate";
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

function productPrompt(selection: Selection) {
  const systemColor = colorLabel(selection.systemColor);
  const fabricColor = selection.fabricColor ? colorLabel(selection.fabricColor) : null;

  if (selection.productType === "ROLLUIKEN") {
    return `Add one photorealistic exterior aluminum roller shutter (Dutch: rolluik), fully closed, installed IN the window reveal/recess. The shutter fills the selected window opening precisely, with a realistic top cassette and side guides located within the reveal. System color: ${systemColor}. Do not change the surrounding facade.`;
  }
  if (selection.productType === "ZIPSCREENS") {
    return `Add one photorealistic exterior vertical ZIP SCREEN, fully closed, fitted tightly to the selected window opening/frame. It must follow the existing window perspective and remain inside the selected opening. System color: ${systemColor}. Fabric color: ${fabricColor}. Do not change the surrounding facade.`;
  }
  return `Add one photorealistic folding-arm exterior awning (Dutch: knikarmscherm) with the fabric fully extended. The supplied line marks the mounting position and desired width. Mount the cassette exactly along that line against the facade and extend the fabric outward/downward in a physically plausible way. System color: ${systemColor}. Fabric color: ${fabricColor}. Preserve the existing facade, perspective and lighting.`;
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

async function runFill(imageBuffer: Buffer, maskPng: Buffer, prompt: string, apiKey: string) {
  const replicate = new Replicate({ auth: apiKey });
  console.log("FLUX Fill Pro starten", { imageBytes: imageBuffer.length, maskBytes: maskPng.length, prompt });
  try {
    const output = await replicate.run("black-forest-labs/flux-fill-pro", {
      input: {
        image: imageBuffer,
        mask: maskPng,
        prompt,
        steps: 50,
        guidance: 60,
        prompt_upsampling: false,
        safety_tolerance: 2,
        output_format: "jpg",
      },
    });
    const url = getOutputUrl(output);
    console.log("FLUX Fill Pro klaar");
    return url;
  } catch (error) {
    console.error("FLUX Fill Pro fout:", error);
    throw new Error(error instanceof Error ? `Replicate/FLUX fout: ${error.message}` : "Onbekende Replicate/FLUX fout.");
  }
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
      const { raw: maskRaw, png: maskPng } = await makeMask(width, height, selection);

      // FLUX Fill Pro requires both dimensions to be at least 256px.
      // We may receive a small browser image, so upscale only the model input.
      // The final AI result is always composited back onto the original-size image
      // with the original mask, so pixels outside the selected area remain untouched.
      const modelMetadata = await sharp(currentBuffer).metadata();
      const sourceWidth = modelMetadata.width ?? width;
      const sourceHeight = modelMetadata.height ?? height;
      const scale = Math.max(1, 256 / sourceWidth, 256 / sourceHeight);
      const modelWidth = Math.max(256, Math.ceil(sourceWidth * scale));
      const modelHeight = Math.max(256, Math.ceil(sourceHeight * scale));

      let modelImage = currentBuffer;
      let modelMask = maskPng;

      if (modelWidth !== sourceWidth || modelHeight !== sourceHeight) {
        modelImage = await sharp(currentBuffer)
          .resize(modelWidth, modelHeight, { fit: "fill" })
          .png()
          .toBuffer();

        modelMask = await sharp(maskPng)
          .resize(modelWidth, modelHeight, { fit: "fill", kernel: "nearest" })
          .png()
          .toBuffer();

        console.log("FLUX input opgeschaald wegens minimum 256px", {
          original: [sourceWidth, sourceHeight],
          model: [modelWidth, modelHeight],
        });
      }

      const generatedUrl = await runFill(modelImage, modelMask, productPrompt(selection), apiKey);
      currentBuffer = await compositeOnlyInsideMask(currentBuffer, generatedUrl, maskRaw, width, height);
      results.push({ id: selection.id, productType: selection.productType });
    }

    return NextResponse.json({
      success: true,
      imageUrl: bufferToDataUri(currentBuffer, "image/png"),
      model: "black-forest-labs/flux-fill-pro",
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
