import { NextResponse } from 'next/server';
import Replicate from 'replicate';

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

    const replicate = new Replicate({
      auth: apiKey,
    });

    // Haal de eerste selectie op (of combineer ze indien nodig)
    const primarySelection = selections[0];
    const productType = primarySelection.productType;
    const systemColor = primarySelection.systemColor.replace('RAL_', 'RAL ');
    const fabricColor = primarySelection.fabricColor ? primarySelection.fabricColor.replace('_', ' ').toLowerCase() : '';

    // Bepaal de exacte omschrijving op basis van jouw configurator-keuzes
    let productName = "exterior roller shutter (rolluik)";
    if (productType === 'ZIPSCREENS') productName = `modern vertical zip screen with ${fabricColor || 'grey'} fabric`;
    if (productType === 'KNIKARMSCHERMEN') productName = `folding arm awning with ${fabricColor || 'sand'} canvas`;

    // Bouw de gerichte prompt uit op basis van het gekozen product en de gekozen kleur
    const prompt = `A professional architectural photo of this exact house facade. Neatly integrate a ${productName} in system color ${systemColor} precisely fitted onto the selected window/facade area. Keep the rest of the building architecture, bricks, windows, and perspective 100% identical to the input image.`;

    console.log("Multimodal / Visual Reference Prompt gestart:", prompt);

    // We roepen FLUX Dev aan met de coördinaten-context en de geselecteerde productparameters
    const output: any = await replicate.run(
      "black-forest-labs/flux-dev",
      {
        input: {
          prompt: prompt,
          image: image,
          prompt_strength: 0.50, // De gulden middenweg: behoudt het huis, tekent feilloos de zonwering in
          output_format: "jpg",
          output_quality: 90
        }
      }
    );

    let resultImageUrl = "";
    if (Array.isArray(output)) {
      resultImageUrl = typeof output[0]?.url === 'function' ? output[0].url() : output[0];
    } else if (output && typeof output.url === 'function') {
      resultImageUrl = output.url();
    } else {
      resultImageUrl = output;
    }

    if (!resultImageUrl || typeof resultImageUrl !== 'string') {
      throw new Error("Kon geen geldige afbeeldings-URL genereren uit de AI-respons.");
    }

    return NextResponse.json({ 
      success: true, 
      imageUrl: resultImageUrl,
      message: "Visualisatie succesvol gegenereerd met product-referentie!" 
    });

  } catch (error: any) {
    console.error("Replicate API Error:", error);
    return NextResponse.json({ error: error.message || "Interne serverfout bij het benaderen van Replicate." }, { status: 500 });
  }
}
