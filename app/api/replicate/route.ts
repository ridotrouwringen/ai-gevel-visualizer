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

    // Specifieke prompt voor FLUX Fill inpainting
    let promptText = "exterior roller shutter (rolluik)";
    if (product === 'ZIPSCREENS') promptText = "modern vertical zip screen sun protection";
    if (product === 'KNIKARMSCHERMEN') promptText = "modern folding arm awning (knikarmscherm)";

    const fullPrompt = `A photorealistic ${promptText} in system color ${color}, mounted professionally on the window frame, matching perspective and shadows.`;

    console.log("Start FLUX Fill Inpainting met prompt:", fullPrompt);

    // We gebruiken het officiële black-forest-labs/flux-fill-dev model voor inpainting
    const output: any = await replicate.run(
      "black-forest-labs/flux-fill-dev",
      {
        input: {
          image: image,
          prompt: fullPrompt,
          output_format: "jpg",
          output_quality: 90,
          num_inference_steps: 28,
          guidance: 30
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
      message: "Zonwering succesvol ingetekend door de AI!" 
    });

  } catch (error: any) {
    console.error("Replicate API Error:", error);
    return NextResponse.json({ error: error.message || "Interne serverfout bij het benaderen van Replicate." }, { status: 500 });
  }
}
