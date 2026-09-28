import { NextResponse } from "next/server";

const ROBOFLOW_WORKSPACE = "gevels";
const ROBOFLOW_WORKFLOW =
  "kozijn-detectie-vkozijn-detectie-2-rfdetr-small-t1-logic";

export async function POST(request: Request) {
  try {
    const apiKey = process.env.ROBOFLOW_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: "ROBOFLOW_API_KEY ontbreekt in Vercel Environment Variables." },
        { status: 500 }
      );
    }

    const formData = await request.formData();
    const image = formData.get("image");

    if (!(image instanceof File)) {
      return NextResponse.json(
        { error: "Stuur een afbeelding mee als form-data veld 'image'." },
        { status: 400 }
      );
    }

    const bytes = await image.arrayBuffer();
    const base64 = Buffer.from(bytes).toString("base64");

    const response = await fetch(
      `https://serverless.roboflow.com/${ROBOFLOW_WORKSPACE}/workflows/${ROBOFLOW_WORKFLOW}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          api_key: apiKey,
          inputs: {
            image: {
              type: "base64",
              value: base64,
            },
          },
        }),
      }
    );

    const result = await response.json();

    return NextResponse.json(
      {
        roboflowStatus: response.status,
        result,
      },
      { status: response.ok ? 200 : response.status }
    );
  } catch (error) {
    console.error("Roboflow test error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Onbekende fout bij Roboflow test.",
      },
      { status: 500 }
    );
  }
}
