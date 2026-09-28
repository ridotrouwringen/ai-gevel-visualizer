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
const GENERATION_CONCURRENCY = 1;

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

function productPrompt(selection: Selection) {
  const systemColor = colorLabel(selection.systemColor);
  const fabricColor = selection.fabricColor ? colorLabel(selection.fabricColor) : null;

  if (selection.productType === "ROLLUIKEN") {
    return `Create ONE isolated, complete exterior aluminum roller shutter product asset using IMAGE 1 as the physical product reference.

This is NOT a facade editing task and NOT a window detection task.
Do not show a house, window, wall, glass or architecture.
Generate the product straight-on, perfectly rectangular, front-facing and axis-aligned.

The product must consist of exactly:
1. a clearly visible horizontal top cassette across the full width,
2. a fully CLOSED roller-shutter curtain with horizontal slats,
3. a continuous vertical side guide on the left,
4. a continuous vertical side guide on the right.

The four outer product edges must be straight and parallel.
Do not tilt, rotate, skew or perspective-distort the product.
The complete product must fill almost the entire image canvas, with only a small pure-white margin around it.
System color: ${systemColor}.

Use IMAGE 1 only to copy the real product construction and appearance. Do not copy its background or scene.
The final asset must be a single complete rolluik, not multiple products.`;
  }

  if (selection.productType === "ZIPSCREENS") {
    return `Create ONE isolated, complete exterior ZIP SCREEN product asset using IMAGE 1 as the physical product reference.

This is NOT a facade editing task and NOT a window detection task.
Do not show a house, window, wall, glass or architecture.
Generate the product straight-on, perfectly rectangular, front-facing and axis-aligned.

The product must consist of one continuous fully CLOSED screen with a clear top cassette and continuous left and right side guides.
The four outer product edges must be straight and parallel.
Do not tilt, rotate, skew or perspective-distort the product.
The complete product must fill almost the entire image canvas, with only a small pure-white margin around it.
System color: ${systemColor}.
Fabric color: ${fabricColor}.

Use IMAGE 1 only to copy the real product construction and appearance. Do not copy its background or scene.
The final asset must be a single complete ZIP screen, not multiple products.`;
  }

  return `Create ONE isolated, complete folding-arm awning product asset using IMAGE 1 as the physical product reference.

This is NOT a facade editing task.
Do not show a house or architecture.
Generate one straight-on, axis-aligned awning with the fabric FULLY EXTENDED.
System color: ${systemColor}.
Fabric color: ${fabricColor}.

Use IMAGE 1 only to copy the real product construction, proportions and appearance.
The final asset must be a single complete awning on a pure-white background.`;
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
  bounds: { left: number; top: number; right: number; bottom: number },
  productType: ProductType
) {
  const width = bounds.right - bounds.left;
  const height = bounds.bottom - bounds.top;
  const channels = 3;
  const local = Buffer.alloc(width * height * channels, 245);

  const setPixel = (x: number, y: number, r: number, g: number, b: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const i = (y * width + x) * channels;
    local[i] = r; local[i + 1] = g; local[i + 2] = b;
  };

  const fillRect = (x0: number, y0: number, x1: number, y1: number, r: number, g: number, b: number) => {
    for (let y = Math.max(0, y0); y < Math.min(height, y1); y++) {
      for (let x = Math.max(0, x0); x < Math.min(width, x1); x++) setPixel(x, y, r, g, b);
    }
  };

  if (productType === "ROLLUIKEN" || productType === "ZIPSCREENS") {
    const cassetteHeight = Math.max(2, Math.round(height * 0.11));
    const guideWidth = Math.max(2, Math.round(width * 0.035));
    const border = Math.max(3, Math.round(Math.min(width, height) * 0.025));

    // Neutral construction drawing. The outer frame is the hard placement boundary.
    fillRect(0, 0, width, height, 235, 235, 235);
    fillRect(0, 0, width, border, 20, 20, 20);
    fillRect(0, height - border, width, height, 20, 20, 20);
    fillRect(0, 0, border, height, 20, 20, 20);
    fillRect(width - border, 0, width, height, 20, 20, 20);

    // Strong corner anchors reinforce orientation and prevent unintended slant.
    const anchor = Math.max(4, Math.round(Math.min(width, height) * 0.06));
    fillRect(0, 0, anchor, anchor, 0, 0, 0);
    fillRect(width - anchor, 0, width, anchor, 0, 0, 0);
    fillRect(0, height - anchor, anchor, height, 0, 0, 0);
    fillRect(width - anchor, height - anchor, width, height, 0, 0, 0);

    // Product construction inside the hard outer frame.
    fillRect(border, cassetteHeight, width - border, height - border, 205, 205, 205);
    fillRect(border, border, width - border, cassetteHeight, 80, 80, 80);
    fillRect(border, cassetteHeight, border + guideWidth, height - border, 65, 65, 65);
    fillRect(width - border - guideWidth, cassetteHeight, width - border, height - border, 65, 65, 65);

    const slatStep = Math.max(3, Math.round(height * 0.025));
    for (let y = cassetteHeight + slatStep; y < height - border; y += slatStep) {
      for (let x = border + guideWidth; x < width - border - guideWidth; x++) {
        setPixel(x, y, 125, 125, 125);
      }
    }

    // Center crosshair reinforces the intended vertical/horizontal orientation.
    const centerX = Math.floor(width / 2);
    const centerY = Math.floor(height / 2);
    const crossThickness = Math.max(1, Math.round(border / 2));
    for (let y = border; y < height - border; y++) {
      for (let x = centerX - crossThickness; x <= centerX + crossThickness; x++) {
        setPixel(x, y, 170, 170, 170);
      }
    }
    for (let x = border; x < width - border; x++) {
      for (let y = centerY - crossThickness; y <= centerY + crossThickness; y++) {
        setPixel(x, y, 170, 170, 170);
      }
    }  } else {
    const localMask = Buffer.alloc(width * height);
    for (let y = bounds.top; y < bounds.bottom; y++) {
      const sourceStart = y * imageWidth + bounds.left;
      const sourceEnd = sourceStart + width;
      const targetStart = (y - bounds.top) * width;
      maskRaw.copy(localMask, targetStart, sourceStart, sourceEnd);
    }
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const v = localMask[y * width + x] > 0 ? 255 : 245;
        setPixel(x, y, v, v, v);
      }
    }
  }

  return sharp(local, { raw: { width, height, channels: 3 } }).png().toBuffer();
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
    ROLLUIKEN: "rolluik.png",
    ZIPSCREENS: "zipscreen.jpg",
    KNIKARMSCHERMEN: "knikarmscherm.jpg",
  };

  const filePath = path.join(process.cwd(), "public", "products", files[productType]);
  return readFile(filePath);
}

async function runProductEdit(
  productReference: Buffer,
  prompt: string,
  apiKey: string
) {
  const replicate = new Replicate({ auth: apiKey });

  console.log("Nano Banana starten", {
    referenceBytes: productReference.length,
    prompt,
  });

  try {
    const output = await replicate.run("google/nano-banana", {
      input: {
        prompt,
        image_input: [productReference],
        aspect_ratio: "match_input_image",
        output_format: "png",
      },
    });

    const url = getOutputUrl(output);
    console.log("Nano Banana klaar");
    return url;
  } catch (error) {
    console.error("Nano Banana fout:", error);
    throw new Error(
      error instanceof Error
        ? `Replicate/Nano Banana fout: ${error.message}`
        : "Onbekende Replicate/Nano Banana fout."
    );
  }
}

type PreparedSelection = {
  selection: Selection;
  maskRaw: Buffer;
  bounds: { left: number; top: number; right: number; bottom: number };
  referenceBuffer: Buffer;
};

type GeneratedSelection = PreparedSelection & {
  generatedUrl: string;
};

async function prepareSelection(
  originalBuffer: Buffer,
  width: number,
  height: number,
  selection: Selection
): Promise<PreparedSelection> {
  const { raw: maskRaw } = await makeMask(width, height, selection);
  const bounds = getSelectionBounds(maskRaw, width, height);

  const referenceBuffer = await loadProductReference(selection.productType);

  return {
    selection,
    maskRaw,
    bounds,
    referenceBuffer,
  };
}

async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<void>
) {
  let nextIndex = 0;

  async function workerLoop() {
    while (true) {
      const index = nextIndex++;
      if (index >= items.length) return;
      await worker(items[index], index);
    }
  }

  const workerCount = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: workerCount }, () => workerLoop()));
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
      concurrency: GENERATION_CONCURRENCY,
      model: "google/nano-banana",
      mode: "isolated-product-then-exact-composite",
    });

    const preparedSelections = await Promise.all(
      selections.map((selection) =>
        prepareSelection(originalBuffer, width, height, selection)
      )
    );

    const generated: Array<GeneratedSelection | undefined> = new Array(preparedSelections.length);

    await runWithConcurrency(
      preparedSelections,
      GENERATION_CONCURRENCY,
      async (prepared, index) => {
        const generatedUrl = await runProductEdit(
          prepared.referenceBuffer,
          productPrompt(prepared.selection),
          apiKey
        );

        generated[index] = {
          ...prepared,
          generatedUrl,
        };
      }
    );

    let currentBuffer = originalBuffer;

    for (let index = 0; index < generated.length; index++) {
      const item = generated[index];
      if (!item) {
        throw new Error("Een AI-generatie ontbreekt in de resultaten.");
      }

      const generatedResponse = await fetch(item.generatedUrl);
      if (!generatedResponse.ok) {
        throw new Error(
          `Het AI-resultaat kon niet worden opgehaald (HTTP ${generatedResponse.status}).`
        );
      }

      const generatedBuffer = Buffer.from(await generatedResponse.arrayBuffer());
      const localWidth = item.bounds.right - item.bounds.left;
      const localHeight = item.bounds.bottom - item.bounds.top;

      // Nano Banana can leave white margins around the isolated product.
      // Trim those margins FIRST, otherwise the product becomes too small
      // and appears shifted inside the exact user selection.
      const trimmedProduct = await sharp(generatedBuffer)
        .trim({
          background: { r: 255, g: 255, b: 255 },
          threshold: 12,
        })
        .png()
        .toBuffer();

      // After trimming, resize the actual product content into the EXACT
      // user-selected rectangle. This makes the product width and height
      // follow the selected kozijn instead of the AI canvas margins.
      const resized = await sharp(trimmedProduct)
        .resize(localWidth, localHeight, { fit: "fill" })
        .removeAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

      const alpha = Buffer.alloc(localWidth * localHeight);
      for (let p = 0, i = 0; p < resized.data.length; p += 3, i++) {
        const r = resized.data[p];
        const g = resized.data[p + 1];
        const b = resized.data[p + 2];

        // Distance from white. Pure/near white background is transparent.
        // Keep a small soft transition so product edges do not look cut out.
        const whiteness = Math.min(r, g, b);
        const maxChannel = Math.max(r, g, b);
        const distance = 255 - whiteness;

        if (distance <= 10 && maxChannel >= 245) {
          alpha[i] = 0;
        } else if (distance <= 35 && maxChannel >= 225) {
          alpha[i] = Math.round(((distance - 10) / 25) * 255);
        } else {
          alpha[i] = 255;
        }
      }

      const localMaskRaw = Buffer.alloc(localWidth * localHeight);
      for (let y = item.bounds.top; y < item.bounds.bottom; y++) {
        const sourceStart = y * width + item.bounds.left;
        const sourceEnd = sourceStart + localWidth;
        const targetStart = (y - item.bounds.top) * localWidth;
        item.maskRaw.copy(localMaskRaw, targetStart, sourceStart, sourceEnd);
      }

      // Combine the AI product alpha with the exact user-selection mask.
      // Do this as one RGBA image: the selection mask must limit the overlay,
      // while the white-background removal keeps the facade visible around the product.
      const combinedAlpha = Buffer.alloc(localWidth * localHeight);
      for (let i = 0; i < combinedAlpha.length; i++) {
        combinedAlpha[i] = Math.round((alpha[i] * localMaskRaw[i]) / 255);
      }

      const finalOverlay = await sharp(resized.data, {
        raw: {
          width: resized.info.width,
          height: resized.info.height,
          channels: 3,
        },
      })
        .joinChannel(combinedAlpha, {
          raw: { width: localWidth, height: localHeight, channels: 1 },
        })
        .png()
        .toBuffer();

      currentBuffer = await sharp(currentBuffer)
        .composite([
          {
            input: finalOverlay,
            left: item.bounds.left,
            top: item.bounds.top,
            blend: "over",
          },
        ])
        .png()
        .toBuffer();
    }

    const results = generated.map((item) => ({
      id: item!.selection.id,
      productType: item!.selection.productType,
    }));

    return NextResponse.json({
      success: true,
      imageUrl: bufferToDataUri(currentBuffer, "image/png"),
      model: "google/nano-banana",
      selectionCount: selections.length,
      results,
      message: "Product gegenereerd als geïsoleerde asset en exact in de selectie geplaatst.",
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
