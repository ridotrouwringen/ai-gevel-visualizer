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
    return `The left part of the input is the ORIGINAL facade photo. The panel on the RIGHT is the selected product reference photo. The magenta/white mask defines the ONLY facade area that may be regenerated.

Place ONE SINGLE continuous photorealistic exterior aluminum roller shutter in the masked area. Treat the entire masked area as ONE product opening, even if the original contains multiple window panes. Do NOT create separate shutters per pane. The rolluik is fully closed, with one continuous top cassette and continuous side guides at the outer edges. Match the physical design, proportions, construction details and material appearance of the product reference panel. System color: ${systemColor}. Keep the facade architecture, brickwork, roof, frames and surrounding context consistent with the original photo. Only the physical area covered by the rolluik may change.`;
  }

  if (selection.productType === "ZIPSCREENS") {
    return `The left part of the input is the ORIGINAL facade photo. The panel on the RIGHT is the selected product reference photo. The magenta/white mask defines the ONLY facade area that may be regenerated.

Place ONE SINGLE continuous photorealistic exterior ZIP SCREEN in the masked area. Treat the entire masked area as ONE product, even if the original contains multiple window panes. Do NOT create separate screens per pane. The screen is fully closed and fitted to the selected area. Match the physical design, proportions, construction details and material appearance of the product reference panel. System color: ${systemColor}. Fabric color: ${fabricColor}. Keep the facade architecture and surrounding context consistent with the original photo. Only the physical area covered by the screen may change.`;
  }

  return `The left part of the input is the ORIGINAL facade photo. The panel on the RIGHT is the selected product reference photo. The masked area is the ONLY facade area that may be regenerated.

Place ONE photorealistic folding-arm exterior awning with the fabric fully extended. Use the selected line/area as the mounting and placement reference. Match the physical design, proportions, construction details and material appearance of the product reference panel. System color: ${systemColor}. Fabric color: ${fabricColor}. Keep the original facade and surrounding context consistent. Only the physical area occupied by the awning may change.`;
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

async function runMaskedEdit(
  imageBuffer: Buffer,
  maskBuffer: Buffer,
  prompt: string,
  apiKey: string
) {
  const replicate = new Replicate({ auth: apiKey });

  console.log("FLUX Fill Pro starten", {
    imageBytes: imageBuffer.length,
    maskBytes: maskBuffer.length,
    prompt,
  });

  try {
    const output = await replicate.run("black-forest-labs/flux-fill-pro", {
      input: {
        image: imageBuffer,
        mask: maskBuffer,
        prompt,
        steps: 50,
        guidance: 7,
        output_format: "png",
        safety_tolerance: 2,
        prompt_upsampling: false,
      },
    });

    const url = getOutputUrl(output);
    console.log("FLUX Fill Pro klaar");
    return url;
  } catch (error) {
    console.error("FLUX Fill Pro fout:", error);
    throw new Error(
      error instanceof Error
        ? `Replicate/FLUX Fill Pro fout: ${error.message}`
        : "Onbekende Replicate/FLUX Fill Pro fout."
    );
  }
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

/**
 * FLUX Fill Pro has a native black/white inpainting mask but no separate
 * reference-image input. We therefore extend the model input canvas to the
 * right and place the selected product reference outside the facade image.
 *
 * The original facade remains at x=0..width. The extension is only context
 * for the model and is cropped away before the final composite.
 */
async function buildReferenceCanvas(
  imageBuffer: Buffer,
  referenceBuffer: Buffer,
  maskRaw: Buffer,
  width: number,
  height: number
) {
  const panelWidth = Math.max(180, Math.min(360, Math.round(Math.min(width, height) * 0.32)));
  const panelPadding = Math.max(12, Math.round(panelWidth * 0.08));
  const panelInnerWidth = panelWidth - panelPadding * 2;
  const panelInnerHeight = Math.max(120, Math.min(260, Math.round(panelInnerWidth * 0.72)));
  const extensionWidth = panelWidth + panelPadding;
  const expandedWidth = width + extensionWidth;

  const referenceImage = await sharp(referenceBuffer)
    .resize(panelInnerWidth, panelInnerHeight, { fit: "inside", withoutEnlargement: false })
    .png()
    .toBuffer();

  const panelSvg = Buffer.from(`
    <svg width="${extensionWidth}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="#f4f4f4"/>
      <rect x="${panelPadding}" y="${panelPadding}" width="${panelInnerWidth}" height="${panelInnerHeight}" rx="8" fill="white"/>
      <text x="${panelPadding}" y="${panelPadding + panelInnerHeight + 24}" font-family="Arial, sans-serif" font-size="14" font-weight="700" fill="#111">PRODUCT REFERENTIE</text>
      <text x="${panelPadding}" y="${panelPadding + panelInnerHeight + 46}" font-family="Arial, sans-serif" font-size="12" fill="#444">Gebruik dit product als vorm-,</text>
      <text x="${panelPadding}" y="${panelPadding + panelInnerHeight + 63}" font-family="Arial, sans-serif" font-size="12" fill="#444">materiaal- en detailreferentie.</text>
    </svg>
  `);

  const expandedImage = await sharp({
    create: {
      width: expandedWidth,
      height,
      channels: 3,
      background: { r: 244, g: 244, b: 244 },
    },
  })
    .composite([
      { input: imageBuffer, left: 0, top: 0 },
      { input: panelSvg, left: width, top: 0 },
      {
        input: referenceImage,
        left: width + panelPadding,
        top: panelPadding,
      },
    ])
    .png()
    .toBuffer();

  const expandedMaskRaw = Buffer.alloc(expandedWidth * height);
  for (let y = 0; y < height; y++) {
    maskRaw.copy(expandedMaskRaw, y * expandedWidth, y * width, (y + 1) * width);
  }

  const expandedMask = await sharp(expandedMaskRaw, {
    raw: { width: expandedWidth, height, channels: 1 },
  }).png().toBuffer();

  return {
    image: expandedImage,
    mask: expandedMask,
    expandedWidth,
  };
}

async function compositeMaskedResult(
  originalBuffer: Buffer,
  generatedUrl: string,
  maskRaw: Buffer,
  width: number,
  height: number
) {
  const generatedResponse = await fetch(generatedUrl);
  if (!generatedResponse.ok) {
    throw new Error(`Het AI-resultaat kon niet worden opgehaald (HTTP ${generatedResponse.status}).`);
  }

  const generatedBuffer = Buffer.from(await generatedResponse.arrayBuffer());

  // Hard preservation boundary:
  // only pixels covered by the exact user mask are taken from the model output.
  // Every pixel outside that mask comes from the original/current facade.
  const generatedOriginalArea = await sharp(generatedBuffer)
    .extract({ left: 0, top: 0, width, height })
    .removeAlpha()
    .joinChannel(maskRaw, {
      raw: { width, height, channels: 1 },
    })
    .png()
    .toBuffer();

  return sharp(originalBuffer)
    .composite([{ input: generatedOriginalArea, left: 0, top: 0, blend: "over" }])
    .png()
    .toBuffer();
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
      const referenceBuffer = await loadProductReference(selection.productType);

      // Keep the user's original image as the canonical canvas.
      // If the source is very small, temporarily upscale only the model input;
      // the final result is always composited back at the original dimensions.
      const MIN_MODEL_SIDE = 256;
      const scale = Math.max(1, MIN_MODEL_SIDE / Math.min(width, height));
      const workingWidth = Math.max(width, Math.round(width * scale));
      const workingHeight = Math.max(height, Math.round(height * scale));

      const workingImage = scale === 1
        ? originalBuffer
        : await sharp(originalBuffer)
            .resize(workingWidth, workingHeight, { fit: "fill" })
            .png()
            .toBuffer();

      const workingMaskRaw = scale === 1
        ? maskRaw
        : await sharp(maskRaw, {
            raw: { width, height, channels: 1 },
          })
            .resize(workingWidth, workingHeight, { fit: "fill", kernel: "nearest" })
            .raw()
            .toBuffer();

      const referenceCanvas = await buildReferenceCanvas(
        workingImage,
        referenceBuffer,
        workingMaskRaw,
        workingWidth,
        workingHeight
      );

      const generatedUrl = await runMaskedEdit(
        referenceCanvas.image,
        referenceCanvas.mask,
        productPrompt(selection, bounds),
        apiKey
      );

      const generatedResponse = await fetch(generatedUrl);
      if (!generatedResponse.ok) {
        throw new Error(`Het AI-resultaat kon niet worden opgehaald (HTTP ${generatedResponse.status}).`);
      }
      const generatedBuffer = Buffer.from(await generatedResponse.arrayBuffer());

      const generatedWorkingFacade = await sharp(generatedBuffer)
        .extract({ left: 0, top: 0, width: workingWidth, height: workingHeight })
        .png()
        .toBuffer();

      const generatedAtOriginalSize = scale === 1
        ? generatedWorkingFacade
        : await sharp(generatedWorkingFacade)
            .resize(width, height, { fit: "fill" })
            .png()
            .toBuffer();

      // Final hard boundary: the exact drag mask is the only source of changed
      // pixels. The original facade is always the base image.
      const generatedMasked = await sharp(generatedAtOriginalSize)
        .removeAlpha()
        .joinChannel(maskRaw, {
          raw: { width, height, channels: 1 },
        })
        .png()
        .toBuffer();

      currentBuffer = await sharp(currentBuffer)
        .composite([{ input: generatedMasked, left: 0, top: 0, blend: "over" }])
        .png()
        .toBuffer();

      results.push({ id: selection.id, productType: selection.productType });
    }

    return NextResponse.json({
      success: true,
      imageUrl: bufferToDataUri(currentBuffer, "image/png"),
      model: "black-forest-labs/flux-fill-pro",
      selectionCount: selections.length,
      results,
      message: "Visualisatie succesvol gegenereerd met exact masked inpainting.",
    });
  } catch (error: unknown) {
    console.error("Inpainting API Error:", error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Interne serverfout tijdens het genereren.",
    }, { status: 500 });
  }
}
