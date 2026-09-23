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
    const productType = primarySelection.productType;
    const systemColor = primarySelection.systemColor.replace('RAL_', 'RAL ');
    const fabricColor = primarySelection.fabricColor ? primarySelection.fabricColor.replace('_', ' ').toLowerCase() : '';

    let productName = "exterior roller shutter (rolluik)";
    if (productType === 'ZIPSCREENS') productName = `modern vertical zip screen with ${fabricColor || 'grey'} fabric`;
    if (productType === 'KNIKARMSCHERMEN') productName = `folding arm awning with ${fabricColor || 'sand'} canvas`;

    const prompt = `A professional architectural photo of this exact house facade. Neatly integrate a ${productName} in system color ${systemColor} precisely fitted onto the selected window/facade area. Keep the rest of the building architecture, bricks, windows, and perspective 100% identical to the input image.`;

    console.log("Start Replicate run met prompt:", prompt);

    // Roep Replicate aan
    const output: any = await replicate.run(
      "black-forest-labs/flux-dev",
      {
        input: {
          prompt: prompt,
          image: image,
          prompt_strength: 0.50,
          output_format: "jpg",
          output_quality: 90
        }
      }
    );

    // Super-veilige URL extractie voor alle Replicate versies
    let resultImageUrl = "";
    const targetOutput = Array.isArray(output) ? output[0] : output;

    if (targetOutput) {
      if (typeof targetOutput === 'string') {
        resultImageUrl = targetOutput;
      } else if (typeof targetOutput.url === 'function') {
        resultImageUrl = targetOutput.url();
      } else if (targetOutput.url && typeof targetOutput.url === 'string') {
        resultImageUrl = targetOutput.url;
      } else {
        resultImageUrl = String(targetOutput);
      }
    }

    if (!resultImageUrl || !resultImageUrl.startsWith('http')) {
      throw new Error("Kon geen geldige afbeeldings-URL extraheren uit de AI-respons.");
    }

    console.log("Succesvolle afbeeldings-URL:", resultImageUrl);

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
