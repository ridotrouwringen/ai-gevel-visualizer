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

    const primarySelection = selections[0];
    const product = primarySelection.productType;
    const color = primarySelection.systemColor.replace('RAL_', 'RAL ');

    const prompt = `A photorealistic architectural photo of a modern house facade with a ${product.toLowerCase()} in color ${color} installed on the window. High quality, natural daylight.`;

    // Stabiele aanroep volgens de officiële Replicate SDK voor Node.js
    const output: any = await replicate.run(
      "black-forest-labs/flux-dev",
      {
        input: {
          prompt: prompt,
          go_fast: true,
          output_format: "jpg",
          output_quality: 90
        }
      }
    );

    // Correcte afhandeling van de output URL volgens Replicate v1.0+ standaards
    let resultImageUrl = "";
    if (Array.isArray(output)) {
      resultImageUrl = typeof output[0]?.url === 'function' ? output[0].url() : output[0];
    } else if (output && typeof output.url === 'function') {
      resultImageUrl = output.url();
    } else {
      resultImageUrl = output;
    }

    if (!resultImageUrl || typeof resultImageUrl !== 'string') {
      throw new Error("Kon geen geldige afbeelding-URL extraheren.");
    }

    return NextResponse.json({ 
      success: true, 
      imageUrl: resultImageUrl,
      message: "Visualisatie succesvol gegenereerd!" 
    });

  } catch (error: any) {
    console.error("Replicate API Error:", error);
    return NextResponse.json({ error: error.message || "Interne serverfout." }, { status: 500 });
  }
}
