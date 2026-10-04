import { NextResponse } from "next/server";
import Replicate from "replicate";
import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { compositeGeneratedProduct } from "@/lib/image-composite";
import { normalizePerspectiveQuad, perspectiveWarpRgba } from "@/lib/perspective-warp";
import { buildLineMask, buildRasterMask, getSelectionBounds } from "@/lib/masks";
import { generationInputError } from "@/lib/replicate-validation";
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

type Selection = Pick<
  MaskShape,
  "id" | "sequenceNumber" | "type" | "coordinates" | "rasterMasks" | "productType" | "systemColor" | "fabricColor" | "mountingMode"
>;

function dataUriToBuffer(dataUri: string) {
  const commaIndex = dataUri.indexOf(",");
  if (commaIndex < 0) throw new Error("De afbeelding moet een base64 data-URI zijn.");
  return Buffer.from(dataUri.slice(commaIndex + 1), "base64");
}

function bufferToDataUri(buffer: Buffer, mime = "image/png") {
  return `data:${mime};base64,${buffer.toString("base64")}`;
}

function colorLabel(id: SystemColor | FabricColor | undefined) {
  if (!id) return "niet gespecificeerd";
  const color = [...SYSTEM_COLORS, ...ZIPSCREEN_FABRICS, ...AWNING_FABRICS].find((item) => item.id === id);
  return color ? `${color.label} (${color.hex})` : id;
}

function productPrompt(selection: Selection, additionalReferenceCount = 0) {
  const systemColor = colorLabel(selection.systemColor);
  const fabricColor = selection.fabricColor ? colorLabel(selection.fabricColor) : null;

  if (selection.productType === "ROLLUIKEN") {
    const mounting = selection.mountingMode === "IN_DE_DAG" ? "in de dag, met de geleiders in de negge" : "op de dag, met de geleiders op de gevel";
    const referenceNote = additionalReferenceCount > 0
      ? `Images 2 through ${additionalReferenceCount + 1} are additional real product photographs supplied by the user. Use them only to understand the roller shutter's actual cassette, side guides, closed slats, bottom rail, finish and component proportions. They are photographs of installed products: do not reproduce their walls, windows, roofs, lighting, camera framing or surroundings.`
      : "Use IMAGE 1 as the physical product reference. Do not invent extra construction details or unsupported dimensions.";

    return `Create ONE isolated, complete exterior aluminum roller shutter product asset.

IMAGE 1 is the existing isolated roller-shutter product reference. ${referenceNote}
This is NOT a facade editing task and NOT a window detection task. Do not show a house, window, wall, glass or architecture.
Generate one complete product straight-on, front-facing and axis-aligned, with straight parallel outer edges.

The product must have these four connected, recognizable components:
- one compact horizontal roller cassette (rolbak) across the top;
- one narrow vertical side guide (zijgeleider) on each side;
- one fully CLOSED curtain (pantser) made ONLY of consistent HORIZONTAL slats, with no visible gap or exposed glass;
- one clear, slim bottom rail (onderlijst) joining the two guides.

CRITICAL PRODUCT IDENTITY RULES:
- This MUST be a roller shutter (rolluik), not venetian blinds, shutters, a grille, mesh, insect screen, lattice, fence, or window blind.
- The closed slats MUST run horizontally from left to right.
- NEVER generate diagonal slats, diagonal stripes, cross-hatching, diamond patterns, mesh, or a woven texture.
- Keep the cassette and both vertical guides clearly visible as physical roller-shutter components.
- Do not turn the curtain into a featureless grey/black rectangle.

Match the shape, finish and relative proportions visible in the supplied real product photographs. Do not impose guessed measurements or arbitrary percentages. Keep the cassette visually compact, both guides consistent in width, slats evenly spaced, and the bottom rail proportionate to the guides. The product must read as one technically coherent roller shutter, not a generic flat panel.
Mounting context for the requested product: ${mounting}. Treat this as a construction cue only; keep the output isolated.
The complete product must fill almost the entire image canvas, with only a small pure-white margin around it.
System color: ${systemColor}.

Use the photographs to reproduce the real product construction and appearance, not their surroundings. The final asset must be one single, complete, fully closed roller shutter, not multiple products.`;
  }

  if (selection.productType === "ZIPSCREENS") {
    return `Create ONE isolated, complete exterior ZIP SCREEN product asset using IMAGE 1 as the physical product reference.

This is NOT a facade editing task and NOT a window detection task.
Do not show a house, window, wall, glass or architecture.
Generate the product straight-on, perfectly rectangular, front-facing and axis-aligned.

The product must consist of one continuous fully CLOSED screen with a clear top cassette.
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
  productReferences: Buffer[],
  prompt: string,
  apiKey: string
) {
  const replicate = new Replicate({ auth: apiKey });

  // Replicate's image_input expects image URLs or base64 data URIs,
  // not raw Node.js Buffers. Normalize every reference to PNG data URI.
  const referenceDataUris = await Promise.all(
    productReferences.map(async (reference) =>
      bufferToDataUri(await sharp(reference).png().toBuffer(), "image/png")
    )
  );

  console.log("Nano Banana starten", {
    referenceBytes: productReferences.map((reference) => reference.length),
    referenceCount: referenceDataUris.length,
    referenceFormats: referenceDataUris.map((reference) => reference.slice(0, 22)),
    prompt,
  });

  try {
    const output = await replicate.run("google/nano-banana", {
      input: {
        prompt,
        image_input: referenceDataUris,
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

type ForegroundMaskLayer = {
  data: (number | boolean)[];
  width: number;
  height: number;
  offsetX: number;
  offsetY: number;
};

function flattenMaskValues(value: unknown): (number | boolean)[] | null {
  if (!Array.isArray(value)) return null;
  const output: (number | boolean)[] = [];
  for (const item of value) {
    if (Array.isArray(item)) {
      const nested = flattenMaskValues(item);
      if (!nested) return null;
      output.push(...nested);
    } else if (typeof item === "number" || typeof item === "boolean") {
      output.push(item);
    } else {
      return null;
    }
  }
  return output;
}

function maskArray(value: unknown): { data: (number | boolean)[]; shape: number[] } | null {
  if (Array.isArray(value)) {
    const data = flattenMaskValues(value);
    if (!data) return null;
    const shape: number[] = [];
    let current: unknown = value;
    while (Array.isArray(current)) {
      shape.push(current.length);
      current = current[0];
    }
    return { data, shape };
  }
  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    const raw = object.data ?? object.values ?? object.array;
    const data = flattenMaskValues(raw);
    const shape = Array.isArray(object.shape)
      ? object.shape.filter((n): n is number => typeof n === "number")
      : [];
    if (data && shape.length) return { data, shape };
  }
  return null;
}

function collectForegroundMaskLayers(value: unknown, output: ForegroundMaskLayer[] = []): ForegroundMaskLayer[] {
  if (!value || typeof value !== "object") return output;
  if (Array.isArray(value)) {
    for (const item of value) collectForegroundMaskLayers(item, output);
    return output;
  }

  const object = value as Record<string, unknown>;
  const masks = maskArray(object.masks);
  const offsets = maskArray(object.masks_offset ?? object.mask_offsets);
  if (masks && offsets && masks.shape.length >= 3) {
    const width = masks.shape[masks.shape.length - 1];
    const height = masks.shape[masks.shape.length - 2];
    const pixelsPerMask = width * height;
    const count = Math.floor(masks.data.length / pixelsPerMask);
    if (width > 0 && height > 0 && count > 0 && offsets.data.length >= count * 2) {
      for (let i = 0; i < count; i++) {
        output.push({
          data: masks.data.slice(i * pixelsPerMask, (i + 1) * pixelsPerMask),
          width,
          height,
          offsetX: Number(offsets.data[i * 2]),
          offsetY: Number(offsets.data[i * 2 + 1]),
        });
      }
    }
  }

  for (const key of ["mask", "masks", "results", "predictions", "output"]) {
    if (object[key] !== object.masks) collectForegroundMaskLayers(object[key], output);
  }
  return output;
}

async function detectForegroundLamp(image: string, apiKey: string, width: number, height: number): Promise<Buffer | null> {
  const response = await fetch("https://api.replicate.com/v1/predictions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Prefer: "wait",
    },
    body: JSON.stringify({
      version: "vufinder/sam3:1bf97763d5dfd3a1584adca913a8ef4b43c684fca97e04e39e4c50a3a5e09650",
      input: {
        image,
        prompts: [JSON.stringify({ text: "lamp post" })],
        confidence_threshold: 0.35,
        visualize: false,
        offset_masks: true,
        split_output: true,
      },
    }),
  });

  const prediction = await response.json();
  if (!response.ok || prediction?.status === "failed") {
    throw new Error(prediction?.detail || prediction?.error || `SAM 3 gaf HTTP ${response.status}`);
  }

  const resultUrls: string[] = Array.isArray(prediction?.output?.results)
    ? prediction.output.results.filter((item: unknown): item is string => typeof item === "string")
    : [];
  const layers = collectForegroundMaskLayers(prediction?.output);
  for (const url of resultUrls) {
    const resultResponse = await fetch(url);
    if (resultResponse.ok) {
      layers.push(...collectForegroundMaskLayers(await resultResponse.json()));
    }
  }

  if (!layers.length) return null;
  const mask = Buffer.alloc(width * height);
  for (const layer of layers) {
    if (!Number.isFinite(layer.offsetX) || !Number.isFinite(layer.offsetY)) continue;
    for (let y = 0; y < layer.height; y++) {
      const targetY = Math.floor(layer.offsetY + y);
      if (targetY < 0 || targetY >= height) continue;
      for (let x = 0; x < layer.width; x++) {
        const value = layer.data[y * layer.width + x];
        const active = typeof value === "boolean" ? value : (value > 1 ? value > 0 : value > 0.5);
        if (!active) continue;
        const targetX = Math.floor(layer.offsetX + x);
        if (targetX >= 0 && targetX < width) mask[targetY * width + targetX] = 255;
      }
    }
  }
  return mask.some((value) => value > 0) ? mask : null;
}

type PreparedSelection = {
  selection: Selection;
  maskRaw: Buffer;
  bounds: { left: number; top: number; right: number; bottom: number };
  referenceBuffer: Buffer;
};

type GeneratedSelection = PreparedSelection & {
  generatedUrl?: string;
  generatedBuffer?: Buffer;
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
    const productReferenceImages = body?.productReferenceImages;

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

    if (productReferenceImages !== undefined && (
      !Array.isArray(productReferenceImages) ||
      productReferenceImages.length > 3 ||
      productReferenceImages.some((value) =>
        typeof value !== "string" ||
        !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(value) ||
        value.length > 700_000
      )
    )) {
      return NextResponse.json(
        { error: "Voeg maximaal 3 productreferenties toe (JPEG, PNG of WebP, maximaal 500 KB per foto)." },
        { status: 400 }
      );
    }

    const extraRolluikReferences = Array.isArray(productReferenceImages)
      ? productReferenceImages.map(dataUriToBuffer)
      : [];

    const validationError = generationInputError(image, selections);
    const validSelections = selections.filter((selection): selection is Selection => {
      if (!selection || !selection.productType || !selection.systemColor) return false;
      if (selection.type === "LINE") return selection.coordinates?.length === 2;
      return Array.isArray(selection.rasterMasks) && selection.rasterMasks.length > 0;
    });

    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
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
      validSelections.map((selection) =>
        prepareSelection(originalBuffer, width, height, selection)
      )
    );

    // Detect a possible foreground lamp in parallel with product generation.
    // If detection fails, keep the existing composite unchanged.
    const hasRollerShutter = validSelections.some((selection) => selection.productType === "ROLLUIKEN");
    const foregroundMaskPromise = hasRollerShutter
      ? detectForegroundLamp(image, apiKey, width, height).catch((error) => {
          console.warn("Voorgrondherkenning overgeslagen:", error);
          return null;
        })
      : Promise.resolve(null);

    const generated: Array<GeneratedSelection | undefined> = new Array(preparedSelections.length);

    await runWithConcurrency(
      preparedSelections,
      GENERATION_CONCURRENCY,
      async (prepared, index) => {
        const isRolluik = prepared.selection.productType === "ROLLUIKEN";

        // ROLLUIKEN: bypass image generation completely for this stabilization
        // test. The supplied system asset is the authoritative product. AI was
        // producing the grey/raster-like result, so it must not participate in
        // roller-shutter placement at all. The user's four points remain the
        // authoritative geometry in our own code.
        if (isRolluik) {
          generated[index] = {
            ...prepared,
            generatedBuffer: prepared.referenceBuffer,
          };
          return;
        }

        const generatedUrl = await runProductEdit(
          [prepared.referenceBuffer],
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

      const generatedBuffer = item.generatedBuffer ?? (() => {
        if (!item.generatedUrl) {
          throw new Error("Geen productasset of AI-resultaat beschikbaar.");
        }
        return fetch(item.generatedUrl).then(async (response) => {
          if (!response.ok) {
            throw new Error(
              `Het AI-resultaat kon niet worden opgehaald (HTTP ${response.status}).`
            );
          }
          return Buffer.from(await response.arrayBuffer());
        });
      })();

      const resolvedGeneratedBuffer = generatedBuffer instanceof Promise
        ? await generatedBuffer
        : generatedBuffer;
      const localWidth = item.bounds.right - item.bounds.left;
      const localHeight = item.bounds.bottom - item.bounds.top;

      // Remove the AI canvas/background first, then find the actual product
      // content. The product itself must fill the complete selected rectangle;
      // otherwise a visually correct width can still leave empty height.
      const isDirectRolluik = item.selection.productType === "ROLLUIKEN" && Boolean(item.generatedBuffer);

      const source = await sharp(resolvedGeneratedBuffer)
        .trim({
          background: { r: 255, g: 255, b: 255 },
          threshold: isDirectRolluik ? 12 : 25,
        })
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

      let contentLeft = source.info.width;
      let contentTop = source.info.height;
      let contentRight = -1;
      let contentBottom = -1;

      for (let y = 0; y < source.info.height; y++) {
        for (let x = 0; x < source.info.width; x++) {
          const p = (y * source.info.width + x) * 4;
          const r = source.data[p];
          const g = source.data[p + 1];
          const b = source.data[p + 2];
          const a = source.data[p + 3];
          if (a < 8) continue;
          const distance = 255 - Math.min(r, g, b);
          if (distance > 18) {
            contentLeft = Math.min(contentLeft, x);
            contentTop = Math.min(contentTop, y);
            contentRight = Math.max(contentRight, x);
            contentBottom = Math.max(contentBottom, y);
          }
        }
      }

      if (contentRight < contentLeft || contentBottom < contentTop) {
        throw new Error("Het AI-product bevat geen bruikbaar productgebied.");
      }

      const contentWidth = contentRight - contentLeft + 1;
      const contentHeight = contentBottom - contentTop + 1;

      const productCrop = await sharp(source.data, {
        raw: {
          width: source.info.width,
          height: source.info.height,
          channels: 4,
        },
      })
        .extract({
          left: contentLeft,
          top: contentTop,
          width: contentWidth,
          height: contentHeight,
        })
.png()
        .toBuffer();

      // Fit the isolated product to the full selected area for this test.
      // The contain experiment left roller shutters too narrow; physical
      // proportions will need to be handled with product geometry/scale later.
      // Normalize the isolated AI product to the selection bounding box first.
      // The four user-selected corners are then used as the authoritative
      // perspective geometry; the AI is never asked to invent that geometry.
      const resized = await sharp(productCrop)
        .resize(localWidth, localHeight, {
          fit: "fill",
          background: { r: 255, g: 255, b: 255, alpha: 0 },
          position: "centre",
        })
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

      const alpha = Buffer.alloc(localWidth * localHeight);
      for (let p = 0, i = 0; p < resized.data.length; p += 4, i++) {
        const r = resized.data[p];
        const g = resized.data[p + 1];
        const b = resized.data[p + 2];
        const a = resized.data[p + 3];
        const whiteness = Math.min(r, g, b);
        const maxChannel = Math.max(r, g, b);
        const distance = 255 - whiteness;
        const whiteCut = isDirectRolluik ? 18 : 10;
        const whiteFade = isDirectRolluik ? 42 : 35;

        if (a < 8 || (distance <= whiteCut && maxChannel >= 245)) {
          alpha[i] = 0;
        } else if (distance <= whiteFade && maxChannel >= 225) {
          alpha[i] = Math.min(a, Math.round(((distance - whiteCut) / (whiteFade - whiteCut)) * 255));
        } else {
          alpha[i] = a;
        }
      }

      const baseRgbProduct = Buffer.alloc(localWidth * localHeight * 3);
      for (let i = 0, p = 0, q = 0; i < alpha.length; i++, p += 4, q += 3) {
        baseRgbProduct[q] = resized.data[p];
        baseRgbProduct[q + 1] = resized.data[p + 1];
        baseRgbProduct[q + 2] = resized.data[p + 2];
      }

      const canPerspectiveWarp =
        item.selection.productType !== "KNIKARMSCHERMEN" &&
        item.selection.coordinates?.length === 4;

      let overlayRgb: Buffer;
      let overlayAlpha: Buffer;
      let overlayWidth = localWidth;
      let overlayHeight = localHeight;
      let overlayLeft = item.bounds.left;
      let overlayTop = item.bounds.top;

      if (canPerspectiveWarp) {
        const quad = normalizePerspectiveQuad(item.selection.coordinates).map((point) => ({
          x: point.x * width - item.bounds.left,
          y: point.y * height - item.bounds.top,
        }));

        const warped = perspectiveWarpRgba(
          baseRgbProduct,
          alpha,
          localWidth,
          localHeight,
          quad
        );

        overlayRgb = Buffer.alloc(warped.width * warped.height * 3);
        overlayAlpha = warped.rgba;
        overlayWidth = warped.width;
        overlayHeight = warped.height;
        overlayLeft = item.bounds.left + warped.offsetX;
        overlayTop = item.bounds.top + warped.offsetY;

        for (let i = 0, p = 0; i < warped.rgba.length; i += 4, p += 3) {
          overlayRgb[p] = warped.rgba[i];
          overlayRgb[p + 1] = warped.rgba[i + 1];
          overlayRgb[p + 2] = warped.rgba[i + 2];
        }
      } else {
        overlayRgb = baseRgbProduct;
        overlayAlpha = alpha;
      }

      // Intersect the transformed product with the exact user mask. This
      // guarantees that no pixels outside the selected facade area are changed.
      const combinedAlpha = Buffer.alloc(overlayWidth * overlayHeight);
      for (let y = 0; y < overlayHeight; y++) {
        const globalY = overlayTop + y;
        if (globalY < 0 || globalY >= height) continue;
        for (let x = 0; x < overlayWidth; x++) {
          const globalX = overlayLeft + x;
          if (globalX < 0 || globalX >= width) continue;
          const alphaIndex = y * overlayWidth + x;
          const maskIndex = globalY * width + globalX;
          combinedAlpha[alphaIndex] = Math.round(
            (overlayAlpha[alphaIndex] * item.maskRaw[maskIndex]) / 255
          );
        }
      }

      currentBuffer = await compositeGeneratedProduct(
        currentBuffer,
        overlayRgb,
        combinedAlpha,
        overlayWidth,
        overlayHeight,
        overlayLeft,
        overlayTop
      );
    }

    // Restore original pixels of detected foreground objects only where they
    // overlap roller-shutter selections, keeping poles in front of the product.
    const foregroundMask = await foregroundMaskPromise;
    if (foregroundMask) {
      const restoreMask = Buffer.alloc(width * height);
      for (const item of generated) {
        if (!item || item.selection.productType !== "ROLLUIKEN") continue;
        for (let i = 0; i < restoreMask.length; i++) {
          if (foregroundMask[i] > 0 && item.maskRaw[i] > 0) restoreMask[i] = 255;
        }
      }

      if (restoreMask.some((value) => value > 0)) {
        const originalRgb = await sharp(originalBuffer)
          .removeAlpha()
          .toColourspace("srgb")
          .raw()
          .toBuffer();
        const originalForeground = await sharp(originalRgb, {
          raw: { width, height, channels: 3 },
        })
          .joinChannel(restoreMask, { raw: { width, height, channels: 1 } })
          .png()
          .toBuffer();

        currentBuffer = await sharp(currentBuffer)
          .composite([{ input: originalForeground, left: 0, top: 0, blend: "over" }])
          .png()
          .toBuffer();
      }
    }

    const results = generated.map((item) => ({
      id: item!.selection.id,
      productType: item!.selection.productType,
    }));

    return NextResponse.json({
      success: true,
      imageUrl: bufferToDataUri(currentBuffer, "image/png"),
      model: "google/nano-banana",
      selectionCount: validSelections.length,
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
