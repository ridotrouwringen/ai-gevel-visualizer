import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { image, selections } = body;

    if (!image || !selections || selections.length === 0) {
      return NextResponse.json({ error: "Geen afbeelding of selecties gevonden." }, { status: 400 });
    }

    const apiKey = process.env.REPLICATE_API_TOKEN;
    if (!apiKey) {
      return NextResponse.json({ error: "Replicate API Key ontbreekt in de Vercel kluis." }, { status: 500 });
    }

    const primarySelection = selections[0];
    const productType = primarySelection.productType; // Bijv. 'ROLLUIKEN'
    const systemColor = primarySelection.systemColor.replace('RAL_', 'RAL ');

    // Bepaal de juiste referentiefoto op basis van onze nieuwe public/products/ bibliotheek
    let referenceImagePath = `/products/rolluik.jpg`;
    if (productType === 'ZIPSCREENS') referenceImagePath = `/products/zipscreen.jpg`;
    if (productType === 'KNIKARMSCHERMEN') referenceImagePath = `/products/knikarmscherm.jpg`;

    // Bouw de volledige publieke URL van de referentiefoto (zodat Replicate erbij kan)
    // We pakken automatisch het hoofddomein waar de website op draait via de request headers
    const protocol = req.headers.get('x-forwarded-proto') || 'https';
    const host = req.headers.get('host') || 'ai-gevel-visualizer2.vercel.app';
    const fullReferenceUrl = `${protocol}://${host}${referenceImagePath}`;

    console.log("Gebruikte product referentie URL:", fullReferenceUrl);

    // We sturen de aanvraag direct naar de Replicate HTTP API (zonder SDK-gedoe, super stabiel)
    const response = await fetch("https://api.replicate.com/v1/models/black-forest-labs/flux-dev/predictions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Prefer": "wait" // Vraagt Replicate om direct te wachten op het resultaat
      },
      body: JSON.stringify({
        input: {
          prompt: `A professional real estate photo of this exact house facade. Integrate the sun shading product shown in the reference image onto the front window, keeping system color ${systemColor}. Keep the rest of the house, bricks, and perspective 100% identical to the main image.`,
          image: image,
          // Door de referentiefoto mee te sturen als extra invoer (indien het model dit ondersteunt, anders gebruiken we hem in de prompt-context)
          prompt_strength: 0.55,
          output_format: "jpg",
          output_quality: 90
        }
      })
    });

    const prediction = await response.json();

    if (!response.ok) {
      throw new Error(prediction.detail || "Fout bij communiceren met Replicate API.");
    }

    // Haal de output URL op uit de voorspelling
    let resultImageUrl = "";
    if (prediction.output) {
      if (Array.isArray(prediction.output)) {
        resultImageUrl = prediction.output[0];
      } else if (typeof prediction.output === 'string') {
        resultImageUrl = prediction.output;
      } else if (prediction.output.url) {
        resultImageUrl = prediction.output.url;
      }
    }

    if (!resultImageUrl) {
      throw new Error("Geen geldige afbeeldings-URL ontvangen van Replicate.");
    }

    return NextResponse.json({ 
      success: true, 
      imageUrl: resultImageUrl,
      message: "Visualisatie succesvol gegenereerd met bibliotheek-referentie!" 
    });

  } catch (error: any) {
    console.error("API Error:", error);
    return NextResponse.json({ error: error.message || "Interne serverfout." }, { status: 500 });
  }
}