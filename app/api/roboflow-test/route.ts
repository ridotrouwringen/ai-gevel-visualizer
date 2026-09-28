import { NextResponse } from "next/server";

const ROBOFLOW_WORKSPACE = "gevels";
const ROBOFLOW_WORKFLOW =
  "kozijn-detectie-vkozijn-detectie-2-rfdetr-small-t1-logic";

export async function GET() {
  return new Response(`<!doctype html>
<html lang="nl">
<head><meta charset="utf-8"><title>Roboflow kozijn test</title></head>
<body style="font-family:Arial,sans-serif;padding:30px">
<h2>Roboflow kozijn test</h2>
<input id="file" type="file" accept="image/*">
<button id="test">Test foto</button>
<pre id="result" style="white-space:pre-wrap;margin-top:20px"></pre>
<script>
document.getElementById("test").onclick = async () => {
  const file = document.getElementById("file").files[0];
  if (!file) { document.getElementById("result").textContent = "Kies eerst een foto."; return; }
  const form = new FormData();
  form.append("image", file);
  document.getElementById("result").textContent = "Bezig...";
  const response = await fetch("/api/roboflow-test", { method: "POST", body: form });
  document.getElementById("result").textContent = JSON.stringify(await response.json(), null, 2);
};
</script>
</body></html>`, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}

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
