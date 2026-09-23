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

    // Een heldere, directe prompt voor de AI om het product toe te voegen
    const prompt = `A photorealistic architectural photo of a building facade. Add a modern ${product.toLowerCase()} in system color ${color} neatly mounted on the window. Keep the rest of the house, walls, bricks, and lighting completely identical to the input image.`;

    console.log("Start Replicate run met prompt:", prompt);

    // We gebruiken de stabiele FLUX dev configuratie met invoer-afbeelding
    const output: any = await replicate.run(
      "black-forest-labs/flux-dev",
      {
        input: {
          prompt: prompt,
          image: image, // De base64 string van de foto
          prompt_strength: 0.35, // Zorgt dat het huis behouden blijft en alleen de zonwering wordt toegevoegd
          output_format: "jpg",
          output_quality: 90
        }
      }
    );

    // Replicate geeft een URL of een array met URL's terug
    let resultImageUrl = "";
    if (Array.isArray(output)) {
      resultImageUrl = output[0];
    } else if (output && typeof output.url === 'function') {
      resultImageUrl = output.url();
    } else {
      resultImageUrl = output;
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
