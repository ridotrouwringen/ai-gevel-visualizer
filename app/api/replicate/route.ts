import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PRODUCTS_LIBRARY } from "@/lib/products";
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

type Selection = Pick<
  MaskShape,
  "id" | "sequenceNumber" | "type" | "coordinates" | "productType" | "systemColor" | "fabricColor"
>;

const PRODUCT_ORDER: ProductType[] = [
  "ROLLUIKEN",
  "ZIPSCREENS",
  "KNIKARMSCHERMEN",
];

function getPublicOrigin(req: Request) {
  const configuredOrigin = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (configuredOrigin) return configuredOrigin;

  const forwardedHost = req.headers.get("x-forwarded-host");
  const host = forwardedHost || req.headers.get("host");

  if (!host) {
    throw new Error(
      "Kan geen publieke URL bepalen voor de productreferenties. Stel NEXT_PUBLIC_APP_URL in op Vercel."
    );
  }

  const forwardedProto = req.headers.get("x-forwarded-proto");
  const protocol = forwardedProto || "https";
  return `${protocol}://${host}`;
}

function colorLabel(id: SystemColor | FabricColor | undefined) {
  if (!id) return "niet gespecificeerd";

  const color = [...SYSTEM_COLORS, ...ZIPSCREEN_FABRICS, ...AWNING_FABRICS].find(
    (item) => item.id === id
  );

  return color ? `${color.label} (${color.hex})` : id;
}

function formatCoordinates(selection: Selection) {
  const coords = selection.coordinates ?? [];

  if (selection.type === "LINE" && coords.length >= 2) {
    return `horizontale lijn van (${coords[0].x.toFixed(3)}, ${coords[0].y.toFixed(3)}) naar (${coords[1].x.toFixed(3)}, ${coords[1].y.toFixed(3)})`;
  }

  if (coords.length === 0) return "geen coördinaten";

  const xs = coords.map((point) => point.x);
  const ys = coords.map((point) => point.y);

  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  return [
    `polygonpunten: ${coords.map((point) => `(${point.x.toFixed(3)}, ${point.y.toFixed(3)})`).join(", ")}`,
    `bounding box: x=${minX.toFixed(3)}..${maxX.toFixed(3)}, y=${minY.toFixed(3)}..${maxY.toFixed(3)}`,
    `centrum: (${((minX + maxX) / 2).toFixed(3)}, ${((minY + maxY) / 2).toFixed(3)})`,
  ].join("; ");
}

function buildPrompt(selections: Selection[]) {
  const productReferences = PRODUCT_ORDER.filter((product) =>
    selections.some((selection) => selection.productType === product)
  );

  const instructions = selections
    .map((selection, index) => {
      const product = PRODUCTS_LIBRARY[selection.productType];
      const systemColor = colorLabel(selection.systemColor);
      const fabricColor = selection.fabricColor
        ? colorLabel(selection.fabricColor)
        : "niet van toepassing";

      return [
        `Zone ${index + 1} (mask #${selection.sequenceNumber}):`,
        `product = ${product.name} (${selection.productType})`,
        `productbeschrijving = ${product.defaultPrompt}`,
        `systeemkleur = ${systemColor}`,
        `doekkleur = ${fabricColor}`,
        `positie in originele afbeelding = ${formatCoordinates(selection)}`,
      ].join(" ");
    })
    .join("\n");

  const referenceInstructions = productReferences
    .map((product, index) => {
      const imageNumber = index + 2;
      return `Referentieafbeelding ${imageNumber} toont het echte producttype "${PRODUCTS_LIBRARY[product].name}". Gebruik deze afbeelding uitsluitend als visuele productreferentie voor alle zones van dit type.`;
    })
    .join("\n");

  return `You are editing an existing real-estate photograph of a house facade.

INPUT IMAGE ORDER:
- Image 1 is the ORIGINAL facade photograph. This is the image that must be preserved.
- Images 2 onward are PRODUCT REFERENCE photographs, in the order described below.

TASK:
Add the requested exterior sun-shading products to the ORIGINAL facade photograph. Do not redesign or regenerate the house.

ABSOLUTE PRESERVATION RULES:
- Preserve the original house, facade, windows, doors, brickwork, roof, garden, pavement, cars, people and background.
- Preserve the original camera viewpoint, perspective, framing, lighting and time of day.
- Only add or modify the requested sun-shading products.
- Do not move, resize, replace or invent windows.
- Make every product physically plausible and correctly attached to the facade.
- Match perspective, scale, materials, reflections and shadows to the original photograph.
- Product locations are expressed as normalized coordinates from 0.000 to 1.000, measured from the top-left of Image 1.
- Treat the supplied mask coordinates as strong placement constraints. The product must occupy the indicated area/line, not an arbitrary nearby window.

REQUESTED PRODUCTS:
${instructions}

PRODUCT REFERENCE MAPPING:
${referenceInstructions}

FINAL QUALITY:
Produce a photorealistic architectural visualization suitable for a professional sun-shading quotation. The result must look like the same original photograph after the requested products were installed.`;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const image = body?.image;
    const selections = body?.selections as Selection[] | undefined;

    if (!image || !Array.isArray(selections) || selections.length === 0) {
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

    const invalidSelection = selections.find(
      (selection) =>
        !PRODUCT_ORDER.includes(selection.productType) ||
        !selection.systemColor ||
        !Array.isArray(selection.coordinates) ||
        selection.coordinates.length === 0
    );

    if (invalidSelection) {
      return NextResponse.json(
        { error: "Een of meer selecties bevatten ongeldige product-, kleur- of positiegegevens." },
        { status: 400 }
      );
    }

    // Image 1 = original facade. Images 2+ = one reference image per unique product type.
    // Do NOT use the Vercel public URL for the bundled product photos: Replicate may
    // receive a deployment/protection HTML response instead of the JPEG. Read the
    // static assets directly from the server bundle and send them as data URIs.
    const productTypes = PRODUCT_ORDER.filter((product) =>
      selections.some((selection) => selection.productType === product)
    );

    const referenceImages = await Promise.all(
      productTypes.map(async (product) => {
        const relativePath = PRODUCTS_LIBRARY[product].referenceImage.replace(/^\//, "");
        const filePath = path.join(process.cwd(), "public", relativePath);
        const buffer = await readFile(filePath);
        const extension = path.extname(filePath).toLowerCase();
        const mimeType =
          extension === ".png"
            ? "image/png"
            : extension === ".webp"
              ? "image/webp"
              : "image/jpeg";

        return `data:${mimeType};base64,${buffer.toString("base64")}`;
      })
    );

    const inputImages = [image, ...referenceImages];

    const prompt = buildPrompt(selections);

    console.log("Replicate FLUX.2 request", {
      model: "black-forest-labs/flux-2-max",
      selectionCount: selections.length,
      productTypes,
      referenceImages,
    });

    const response = await fetch(
      "https://api.replicate.com/v1/models/black-forest-labs/flux-2-max/predictions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          Prefer: "wait",
        },
        body: JSON.stringify({
          input: {
            prompt,
            input_images: inputImages,
            // Avoid the FP8 fast path; it can fail inside FlashAttention with q_descale shape errors.\n            go_fast: false,
            aspect_ratio: "match_input_image",
            output_format: "jpg",
            output_quality: 90,
          },
        }),
      }
    );

    const prediction = await response.json();

    if (!response.ok) {
      console.error("Replicate error:", prediction);
      throw new Error(
        prediction?.detail ||
          prediction?.error ||
          "Fout bij communiceren met Replicate API."
      );
    }

    let resultImageUrl = "";

    if (typeof prediction.output === "string") {
      resultImageUrl = prediction.output;
    } else if (Array.isArray(prediction.output)) {
      const firstOutput = prediction.output[0];
      resultImageUrl =
        typeof firstOutput === "string"
          ? firstOutput
          : firstOutput?.url || "";
    } else if (prediction.output?.url) {
      resultImageUrl = prediction.output.url;
    }

    if (!resultImageUrl && prediction.status === "failed") {
      throw new Error(prediction.error || "Replicate kon de visualisatie niet genereren.");
    }

    if (!resultImageUrl) {
      throw new Error(
        "Replicate heeft nog geen afbeeldings-URL teruggegeven. Probeer het opnieuw."
      );
    }

    return NextResponse.json({
      success: true,
      imageUrl: resultImageUrl,
      predictionId: prediction.id,
      model: "black-forest-labs/flux-2-max",
      selectionCount: selections.length,
      message: "Visualisatie succesvol gegenereerd.",
    });
  } catch (error: unknown) {
    console.error("API Error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Interne serverfout tijdens het genereren van de visualisatie.",
      },
      { status: 500 }
    );
  }
}
