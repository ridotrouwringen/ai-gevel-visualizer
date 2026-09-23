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

    const primarySelection = selections.length > 0 ? selections[0] : null;
    const product = primarySelection ? primarySelection.productType : 'zonwering';
    const color = primarySelection ? primarySelection.systemColor.replace('RAL_', 'RAL ') : 'antraciet';

    const prompt = `A photorealistic architectural photo of a building facade. Add a modern ${product.toLowerCase()} in system color ${color} neatly mounted on the window. Keep the rest of the house, walls, bricks, and lighting completely identical to the input image.`;

    const output: any = await replicate.run(
      "black-forest-labs/flux-dev",
      {
        input: {
          prompt: prompt,
          image: image,
          prompt_strength: 0.35,
          output_format: "jpg",
          output_quality: 90
        }
      }
    );

    // FIX: Replicate v1.0+ geeft FileOutput objecten terug. We halen hier de echte URL op.
    let resultImageUrl = "";
    const fileOutput = Array.isArray(output) ? output[0] : output;

    if (fileOutput) {
      if (typeof fileOutput.url === 'function') {
        resultImageUrl = fileOutput.url(); // Haalt de string URL op via de methode
      } else if (typeof fileOutput === 'string') {
        resultImageUrl = fileOutput;
      } else if (fileOutput.url) {
        resultImageUrl = fileOutput.url;
      }
    }

    if (!resultImageUrl) {
      throw new Error("Kon geen geldige afbeelding-URL extraheren uit de AI-respons.");
    }

    console.log("Gegenereerde afbeeldings-URL:", resultImageUrl);

    return NextResponse.json({ 
      success: true, 
      imageUrl: resultImageUrl,
      message: "Visualisatie succesvol gegenereerd!" 
    });

  } catch (error: any) {
    console.error("Replicate API Error:", error);
    return NextResponse.json({ error: error.message || "Interne serverfout bij het benaderen van Replicate." }, { status: 500 });
  }
}
