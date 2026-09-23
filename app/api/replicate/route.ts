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

    let productName = "roller shutter (rolluik)";
    if (product === 'ZIPSCREENS') productName = "modern vertical zip screen";
    if (product === 'KNIKARMSCHERMEN') productName = "folding arm awning";

    const prompt = `A professional real estate photo of this exact house facade. Neatly add a ${productName} in system color ${color} onto the front window. Maintain the exact building perspective, architecture, bricks, and lighting.`;

    console.log("Replicate aanroep gestart met prompt:", prompt);

    // We gebruiken black-forest-labs/flux-dev en leveren de afbeelding aan als data-URI (base64)
    const output: any = await replicate.run(
      "black-forest-labs/flux-dev",
      {
        input: {
          prompt: prompt,
          image: image,
          prompt_strength: 0.55,
          output_format: "jpg",
          output_quality: 90
        }
      }
    );

    // Veilige extractie van de gegenereerde URL
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
      message: "Visualisatie succesvol gegenereerd!" 
    });

  } catch (error: any) {
    console.error("Replicate API Error:", error);
    return NextResponse.json({ error: error.message || "Interne serverfout bij het benaderen van Replicate." }, { status: 500 });
  }
}
