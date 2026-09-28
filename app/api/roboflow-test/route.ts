import { NextResponse } from "next/server";

const ROBOFLOW_WORKSPACE = "gevels";
const ROBOFLOW_WORKFLOW =
  "kozijn-detectie-vkozijn-detectie-2-rfdetr-small-t1-logic";

export async function GET() {
  return new Response(`<!doctype html>
<html lang="nl">
<head>
<meta charset="utf-8">
<title>Roboflow kozijn test</title>
<style>
body{font-family:Arial,sans-serif;padding:20px}
#wrap{position:relative;display:inline-block;margin-top:15px}
#preview{display:block;max-width:900px;height:auto}
#boxes{position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none}
</style>
</head>
<body>
<h2>Roboflow kozijn test</h2>
<input id="file" type="file" accept="image/*">
<button id="test">Test foto</button>
<div id="wrap">
  <img id="preview">
  <canvas id="boxes"></canvas>
</div>
<pre id="result" style="white-space:pre-wrap;margin-top:20px"></pre>
<script>
const fileInput = document.getElementById("file");
const preview = document.getElementById("preview");
const canvas = document.getElementById("boxes");
const ctx = canvas.getContext("2d");

document.getElementById("test").onclick = async () => {
  const file = fileInput.files[0];
  if (!file) {
    document.getElementById("result").textContent = "Kies eerst een foto.";
    return;
  }

  preview.src = URL.createObjectURL(file);
  await new Promise(resolve => preview.onload = resolve);

  const form = new FormData();
  form.append("image", file);
  document.getElementById("result").textContent = "Bezig...";

  const response = await fetch("/api/roboflow-test", {
    method: "POST",
    body: form
  });
  const data = await response.json();

  const predictions =
    data?.result?.outputs?.[0]?.predictions?.predictions || [];

  const imageWidth =
    data?.result?.outputs?.[0]?.predictions?.image?.width || preview.naturalWidth;
  const imageHeight =
    data?.result?.outputs?.[0]?.predictions?.image?.height || preview.naturalHeight;

  canvas.width = imageWidth;
  canvas.height = imageHeight;

  ctx.clearRect(0, 0, imageWidth, imageHeight);
  ctx.lineWidth = Math.max(2, imageWidth / 300);
  ctx.font = Math.max(12, imageWidth / 45) + "px Arial";

  predictions.forEach((p, i) => {
    const x = p.x - p.width / 2;
    const y = p.y - p.height / 2;

    ctx.strokeStyle = "#00ff00";
    ctx.strokeRect(x, y, p.width, p.height);

    ctx.fillStyle = "#00ff00";
    ctx.fillText(String(i + 1), x + 3, y + 16);
  });

  document.getElementById("result").textContent =
    "Aantal detecties: " + predictions.length + "\\n\\n" +
    JSON.stringify(data, null, 2);
};
</script>
</body>
</html>`, { headers: { "Content-Type": "text/html; charset=utf-8" } });
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
