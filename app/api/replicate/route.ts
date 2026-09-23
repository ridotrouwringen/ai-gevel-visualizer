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

    // Een heel directe prompt die de AI dwingt om het product zichtbaar toe te voegen
    let productDescription = "sun shading system";
    if (product === 'ROLLUIKEN') productDescription = `closed exterior roller shutter (rolluik) in system color ${color}`;
    if (product === 'ZIPSCREENS') productDescription = `modern vertical zip screen in system color ${color}`;
    if (product === 'KNIKARMSCHERMEN') productDescription = `folding arm awning in system color ${color}`;

    const prompt = `A professional real estate photo of this exact house facade. Clearly and visibly add a ${productDescription} mounted onto the front window. High detail, realistic shadows, matching the original building perspective, architecture, and daylight.`;

    console.log("Strenge AI Prompt:", prompt);

    const output: any = await replicate.run(
      "black-forest-labs/flux-dev",
      {
        input: {
          prompt: prompt,
          image: image,
          prompt_strength: 0.65, // Verhoogd zodat de AI het product nu wél actief toevoegt met behoud van het huis
          output_format: "jpg",
          output_quality: 90
        }
      }
    );

    let resultImageUrl = "";
    const fileOutput = Array.isArray(output) ? output[0] : output;

    if (fileOutput) {
      if (typeof fileOutput.url === 'function') {
        resultImageUrl = fileOutput.url();
      } else if (typeof fileOutput === 'string') {
        resultImageUrl = fileOutput;
      } else if (fileOutput.url) {
        resultImageUrl = fileOutput.url;
      }
    }

    if (!resultImageUrl) {
      throw new Error("Kon geen geldige afbeelding-URL extraheren uit de AI-respons.");
    }

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
