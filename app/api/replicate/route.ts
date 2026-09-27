import { NextResponse } from "next/server";
import Replicate from "replicate";
import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import {
  SYSTEM_COLORS,
  ZIPSCREEN_FABRICS,
  AWNING_FABRICS,
  type FabricColor,
  type MaskShape,
  type ProductType,
  type SystemColor,
} from "@/types/visualizer";

export const maxDuration = 120;

type RasterMask = NonNullable<MaskShape["rasterMasks"]>[number];
type Selection = Pick<
  MaskShape,
  "id" | "sequenceNumber" | "type" | "coordinates" | "rasterMasks" | "productType" | "systemColor" | "fabricColor"
>;

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

/**
 * The product is generated ONLY for the selected area.
 * The input image for the model is the original photo crop of that exact
 * selection, plus the real product reference image as a separate input image.
 */
function productPrompt(selection: Selection) {
  const systemColor = colorLabel(selection.systemColor);
  const fabricColor = selection.fabricColor ? colorLabel(selection.fabricColor) : null;

  if (selection.productType === "ROLLUIKEN") {
    return `IMAGE 1 is the ORIGINAL PHOTO CROP OF EXACTLY THE USER'S SELECTION. IMAGE 2 is the PRODUCT REFERENCE. IMAGE 3 is a BLACK/WHITE GEOMETRY GUIDE for IMAGE 1.

CRITICAL: IMAGE 1 itself is the exact target area chosen by the user. Do not search for or infer another window inside it. DO NOT decide what part of IMAGE 1 is the window. DO NOT detect panes, frames, glass or openings. DO NOT shrink the product to fit an inferred window.

The WHITE area in IMAGE 3 is the installation area. Fill that ENTIRE WHITE area from its left edge to its right edge and from its top edge to its bottom edge with ONE SINGLE complete exterior aluminum roller shutter SYSTEM. The installed product MUST visibly contain ALL THREE physical parts as one unit: (1) a clear horizontal TOP CASSETTE/BOX across the full width at the top, (2) the complete CLOSED ROLLER-SHUTTER ARMOR/SLAT CURTAIN below it, and (3) a vertical SIDE GUIDE on the LEFT and a vertical SIDE GUIDE on the RIGHT running the full height of the curtain. Do NOT generate only the armor/slats. Do NOT omit the top cassette. Do NOT omit either side guide. The cassette and both guides must be clearly visible and physically connected to the shutter. Do not use the surrounding context as part of the installation area.

ONE product only. ONE continuous rolluik across the complete selected rectangle. FULLY CLOSED. No separate shutters for panes. No visible original window glass or internal window divisions inside the selected rectangle.

Use IMAGE 2 as the physical product reference, but prioritize the complete PRODUCT CONSTRUCTION: TOP CASSETTE + LEFT SIDE GUIDE + CLOSED SLAT CURTAIN + RIGHT SIDE GUIDE. Reconstruct all four visible structural elements as one complete rolluik system. Use IMAGE 1 only for real perspective, facade context and lighting. Use IMAGE 3 only for exact geometry.
System color: ${systemColor}.

Keep only the real perspective, camera angle and lighting relationship from IMAGE 1. Do not reinterpret the selection.
The output must be a photorealistic installed rolluik that reaches all four edges of the WHITE geometry in IMAGE 3.`;
  }

  if (selection.productType === "ZIPSCREENS") {
    return `IMAGE 1 is the ORIGINAL PHOTO CROP OF EXACTLY THE USER'S SELECTION. IMAGE 2 is the PRODUCT REFERENCE. IMAGE 3 is a BLACK/WHITE GEOMETRY GUIDE for IMAGE 1.

CRITICAL: IMAGE 1 itself is the exact target area chosen by the user. Do not search for or infer another window inside it. DO NOT decide what part of IMAGE 1 is the window. DO NOT detect panes, frames, glass or openings. DO NOT shrink the product to fit an inferred window.

The WHITE area in IMAGE 3 is the installation area. Fill that ENTIRE WHITE area from its left edge to its right edge and from its top edge to its bottom edge with ONE SINGLE continuous exterior ZIP SCREEN. Do not use the surrounding context as part of the installation area.

ONE product only. ONE continuous screen across the complete selected rectangle. FULLY CLOSED. No separate screens for panes. No visible original window glass or internal window divisions inside the selected rectangle.

Use IMAGE 2 ONLY as the physical product reference for the screen construction, side guides, cassette, proportions and material appearance. Use IMAGE 1 only for real perspective, facade context and lighting. Use IMAGE 3 only for exact geometry.
System color: ${systemColor}.
Fabric color: ${fabricColor}.

Keep only the real perspective, camera angle and lighting relationship from IMAGE 1. Do not reinterpret the selection.
The output must be a photorealistic installed ZIP SCREEN that reaches all four edges of the WHITE geometry in IMAGE 3.`;
  }

  return `IMAGE 1 is the original facade crop at the selected awning position.
IMAGE 2 is the actual product reference photo for the folding-arm awning.

Edit IMAGE 1 by adding ONE photorealistic folding-arm exterior awning at the indicated selected position.
The awning fabric is FULLY EXTENDED.
Use IMAGE 2 as the physical product reference for the awning construction, cassette, arms, proportions and material appearance.
System color: ${systemColor}.
Fabric color: ${fabricColor}.

Preserve the real facade perspective, camera angle, lighting and architecture from IMAGE 1.
Return exactly one installed awning.`;
}

function buildLineMask(width: number, height: number, coordinates: { x: number; y: number }[]) {
  const start = coordinates[0], end = coordinates[1];
  const left = Math.max(0, Math.min(start.x, end.x));
  const right = Math.min(1, Math.max(start.x, end.x));
  const top = Math.max(0, Math.min(start.y, end.y));
  const bottom = Math.min(1, top + 0.20);
  const x0 = Math.floor(left * width), x1 = Math.ceil(right * width);
  const y0 = Math.floor(top * height), y1 = Math.ceil(bottom * height);
  const data = Buffer.alloc(width * height);
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) data[y * width + x] = 255;
  }
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
        if (Number(mask.data[y * mask.width + x] ?? 0) > 0) {
          data[targetY * width + targetX] = 255;
        }
      }
    }
  }

  return data;
}

async function makeMask(width: number, height: number, selection: Selection) {
  const raw =
    selection.type === "LINE"
      ? buildLineMask(width, height, selection.coordinates)
      : buildRasterMask(width, height, selection.rasterMasks ?? []);

  const png = await sharp(raw, {
    raw: { width, height, channels: 1 },
  }).png().toBuffer();

  return { raw, png };
}

/**
 * Finds the bounding box OF THE EXISTING MASK.
 * This is not a second selection and does not alter the mask.
 * It is only used to crop the original photo before sending it to the model.
 */
function getSelectionBounds(maskRaw: Buffer, width: number, height: number) {
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;

  for (let y = 0; y < height; y++) {
    const rowOffset = y * width;
    for (let x = 0; x < width; x++) {
      if (maskRaw[rowOffset + x] > 0) {
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
    }
  }

  if (right < left || bottom < top) {
    throw new Error("De geselecteerde mask bevat geen actieve pixels.");
  }

  return { left, top, right: right + 1, bottom: bottom + 1 };
}

async function makeGeometryGuide(
  maskRaw: Buffer,
  imageWidth: number,
  imageHeight: number,
  bounds: { left: number; top: number; right: number; bottom: number }
) {
  const width = bounds.right - bounds.left;
  const height = bounds.bottom - bounds.top;
  const local = Buffer.alloc(width * height);

  for (let y = bounds.top; y < bounds.bottom; y++) {
    const sourceStart = y * imageWidth + bounds.left;
    const sourceEnd = sourceStart + width;
    const targetStart = (y - bounds.top) * width;
    maskRaw.copy(local, targetStart, sourceStart, sourceEnd);
  }

  return sharp(local, {
    raw: { width, height, channels: 1 },
  })
    .png()
    .toBuffer();
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
 * Nano Banana Pro supports multiple input images.
 *
 * IMAGE 1 = the original photo crop for the exact selected mask.
 * IMAGE 2 = the actual product reference photo.
 *
 * Unlike the previous FLUX workaround, the reference image is NOT placed
 * next to the facade and is NOT mixed into the facade canvas.
 */
async function runProductEdit(
  selectedCrop: Buffer,
  productReference: Buffer,
  geometryGuide: Buffer,
  prompt: string,
  apiKey: string
) {
  const replicate = new Replicate({ auth: apiKey });

  console.log("Nano Banana Pro starten", {
    cropBytes: selectedCrop.length,
    referenceBytes: productReference.length,
    guideBytes: geometryGuide.length,
    prompt,
  });

  try {
    const output = await replicate.run("google/nano-banana-pro", {
      input: {
        prompt,
        image_input: [selectedCrop, productReference, geometryGuide],
        aspect_ratio: "match_input_image",
        resolution: "2K",
        output_format: "png",
        allow_fallback_model: true,
      },
    });

    const url = getOutputUrl(output);
    console.log("Nano Banana Pro klaar");
    return url;
  } catch (error) {
    console.error("Nano Banana Pro fout:", error);
    throw new Error(
      error instanceof Error
        ? `Replicate/Nano Banana Pro fout: ${error.message}`
        : "Onbekende Replicate/Nano Banana Pro fout."
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const image = body?.image;
    const selections = body?.selections as Selection[] | undefined;

    if (typeof image !== "string" || !Array.isArray(selections) || selections.length === 0) {
      return NextResponse.json(
        { error: "Geen afbeelding of selecties gevonden." },
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

    const invalid = selections.find((selection) => {
      if (!selection.productType || !selection.systemColor) return true;
      if (selection.type === "LINE") return selection.coordinates?.length !== 2;
      return !Array.isArray(selection.rasterMasks) || selection.rasterMasks.length === 0;
    });

    if (invalid) {
      return NextResponse.json(
        { error: "Een of meer selecties bevatten geen geldige montagegeometrie." },
        { status: 400 }
      );
    }

    const originalBuffer = dataUriToBuffer(image);
    const metadata = await sharp(originalBuffer).metadata();
    const width = metadata.width;
    const height = metadata.height;

    if (!width || !height) {
      return NextResponse.json(
        { error: "Afbeeldingsafmetingen konden niet worden bepaald." },
        { status: 400 }
      );
    }

    console.log("Generatie gestart", {
      imageBytes: originalBuffer.length,
      width,
      height,
      selections: selections.length,
    });

    // This is always the canonical photo. Every generated product is
    // composited back onto this image. We never replace the full facade.
    let currentBuffer = originalBuffer;

    const results: Array<{ id: string; productType: ProductType }> = [];

    for (const selection of selections) {
      const { raw: maskRaw } = await makeMask(width, height, selection);
      const bounds = getSelectionBounds(maskRaw, width, height);

      // IMPORTANT:
      // For each selection the model receives ONLY the exact user-selected crop.
      // This is intentional: on a full facade the individual windows can be small.
      // Giving the model the whole facade/context makes it start interpreting which
      // window is the target. The user's rectangle must be the target, not the AI's
      // interpretation.
      // Every model call starts from the ORIGINAL facade. Previous generated products
      // must never become visual input for another selection.
      const selectedCrop = await sharp(originalBuffer)
        .extract({
          left: bounds.left,
          top: bounds.top,
          width: bounds.right - bounds.left,
          height: bounds.bottom - bounds.top,
        })
        .png()
        .toBuffer();

      // IMAGE 3 marks the exact crop geometry. It contains no other facade.
      const geometryGuide = await makeGeometryGuide(
        maskRaw,
        width,
        height,
        bounds
      );

      const referenceBuffer = await loadProductReference(selection.productType);

      const generatedUrl = await runProductEdit(
        selectedCrop,
        referenceBuffer,
        geometryGuide,
        productPrompt(selection),
        apiKey
      );

      const generatedResponse = await fetch(generatedUrl);
      if (!generatedResponse.ok) {
        throw new Error(
          `Het AI-resultaat kon niet worden opgehaald (HTTP ${generatedResponse.status}).`
        );
      }

      const generatedBuffer = Buffer.from(await generatedResponse.arrayBuffer());

      // Resize the generated crop back to EXACTLY the dimensions of the
      // selected mask bounding box.
      const generatedCrop = await sharp(generatedBuffer)
        .resize(
          bounds.right - bounds.left,
          bounds.bottom - bounds.top,
          { fit: "fill" }
        )
        .removeAlpha()
        .png()
        .toBuffer();

      // Extract the exact selected part of the full-size mask.
      const localMaskRaw = Buffer.alloc(
        (bounds.right - bounds.left) * (bounds.bottom - bounds.top)
      );

      for (let y = bounds.top; y < bounds.bottom; y++) {
        const sourceStart = y * width + bounds.left;
        const sourceEnd = sourceStart + (bounds.right - bounds.left);
        const targetStart = (y - bounds.top) * (bounds.right - bounds.left);
        maskRaw.copy(localMaskRaw, targetStart, sourceStart, sourceEnd);
      }

      // Hard boundary: outside the user's exact selection the original facade
      // remains untouched.
      const generatedMaskedCrop = await sharp(generatedCrop)
        .joinChannel(localMaskRaw, {
          raw: {
            width: bounds.right - bounds.left,
            height: bounds.bottom - bounds.top,
            channels: 1,
          },
        })
        .png()
        .toBuffer();

      currentBuffer = await sharp(currentBuffer)
        .composite([
          {
            input: generatedMaskedCrop,
            left: bounds.left,
            top: bounds.top,
            blend: "over",
          },
        ])
        .png()
        .toBuffer();

      results.push({
        id: selection.id,
        productType: selection.productType,
      });
    }

    return NextResponse.json({
      success: true,
      imageUrl: bufferToDataUri(currentBuffer, "image/png"),
      model: "google/nano-banana-pro",
      selectionCount: selections.length,
      results,
      message: "Visualisatie gegenereerd op basis van de exacte selectie.",
    });
  } catch (error: unknown) {
    console.error("Inpainting API Error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Interne serverfout tijdens het genereren.",
      },
      { status: 500 }
    );
  }
}
