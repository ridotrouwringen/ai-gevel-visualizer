import { NextResponse } from 'next/server';
import Replicate from 'replicate';

// Gericht op inpainting: we behouden het originele huis en passen alleen het geselecteerde deel aan
function buildInpaintPrompt(productType: string, systemColor: string, fabricColor?: string) {
  let colorName = systemColor.replace('RAL_', 'RAL ');
  if (colorName === '9005') colorName += ' Jet Black';
  if (colorName === '7016') colorName += ' Anthracite Grey';
  if (colorName === '9010') colorName += ' Pure White';
  if (colorName === '9001') colorName += ' Cream White';

  let fabricDesc = '';
  if (fabricColor) {
    const cleanFabric = fabricColor.replace('_', ' ').toLowerCase();
    fabricDesc = ` with a ${cleanFabric} colored fabric screen`;
  }

  switch (productType) {
    case 'ROLLUIKEN':
      return `A closed exterior roller shutter (rolluik) with aluminum casing and side guides in ${colorName}, perfectly fitted on this exact window, photorealistic matching the existing building architecture and lighting.`;
    case 'ZIPSCREENS':
      return `A modern vertical zip screen sun protection mounted on this window, with cassette and side channels in ${colorName}${fabricDesc}, photorealistic matching the house facade perspective and shadows.`;
    case 'KNIKARMSCHERMEN':
      return `A modern folding arm awning (knikarmscherm) mounted horizontally on the facade above the window, cassette in ${colorName} and extended awning canvas${fabricDesc}, matching the building's lighting and perspective.`;
    default:
      return `An exterior sun shading system in color ${colorName}, seamlessly integrated into the existing building structure.`;
  }
}

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
    const targetPrompt = buildInpaintPrompt(
      primarySelection.productType, 
      primarySelection.systemColor, 
      primarySelection.fabricColor
    );

    console.log("Inpaint Prompt geselecteerd:", targetPrompt);

    // FLUX Fill vereist een afbeelding en een instructie (prompt) om het geselecteerde deel te bewerken
    const output: any = await replicate.run(
      "black-forest-labs/flux-fill-dev",
      {
        input: {
          image: image, // De originele foto van de klant blijft intact als basis
          prompt: targetPrompt,
          output_format: "jpg",
          num_inference_steps: 28,
          guidance: 30
        }
      }
    );

    const resultImageUrl = Array.isArray(output) ? output[0] : (output?.url ? output.url() : output);

    return NextResponse.json({ 
      success: true, 
      imageUrl: resultImageUrl,
      message: "Gevel succesvol voorzien van zonwering!" 
    });

  } catch (error: any) {
    console.error("Replicate API Error:", error);
    return NextResponse.json({ error: error.message || "Interne serverfout bij het benaderen van Replicate." }, { status: 500 });
  }
}
