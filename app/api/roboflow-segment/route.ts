import { NextResponse } from "next/server";

const ROBOFLOW_WORKSPACE = "gevels";
const ROBOFLOW_WORKFLOW = "kozijn-detectie-vkozijn-detectie-2-rfdetr-small-t1-logic";

export async function POST(request: Request) {
  try {
    const apiKey = process.env.ROBOFLOW_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "ROBOFLOW_API_KEY ontbreekt in Vercel Environment Variables." }, { status: 500 });
    }

    const formData = await request.formData();
    const image = formData.get("image");
    if (!(image instanceof File)) {
      return NextResponse.json({ error: "Stuur een afbeelding mee als form-data veld 'image'." }, { status: 400 });
    }

    const bytes = await image.arrayBuffer();
    const base64 = Buffer.from(bytes).toString("base64");

    const response = await fetch(
      `https://serverless.roboflow.com/${ROBOFLOW_WORKSPACE}/workflows/${ROBOFLOW_WORKFLOW}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: apiKey,
          inputs: { image: { type: "base64", value: base64 } },
        }),
      }
    );

    const result = await response.json();

    const rawTopLevelKeys = result && typeof result === "object" ? Object.keys(result) : [];
    const nestedResult = result?.result;
    const nestedResultKeys = nestedResult && typeof nestedResult === "object" ? Object.keys(nestedResult) : [];
    const outputList = nestedResult?.outputs;
    const outputCount = Array.isArray(outputList) ? outputList.length : 0;
    const firstOutput = Array.isArray(outputList) ? outputList[0] : undefined;
    const outputKeys = firstOutput && typeof firstOutput === "object" ? Object.keys(firstOutput) : [];
    const predictionContainer = firstOutput?.predictions;
    const predictionContainerKeys =
      predictionContainer && typeof predictionContainer === "object"
        ? Object.keys(predictionContainer)
        : [];
    const rawPredictions = predictionContainer?.predictions;
    const predictionsIsArray = Array.isArray(rawPredictions);
    const predictionCount = predictionsIsArray ? rawPredictions.length : 0;

    if (!response.ok) {
      return NextResponse.json(
        {
          error: result?.error || result?.message || `Roboflow gaf HTTP ${response.status} terug.`,
          roboflowStatus: response.status,
          diagnostics: {
            rawTopLevelKeys,
            nestedResultKeys,
            outputCount,
            outputKeys,
            predictionContainerKeys,
            predictionsIsArray,
            predictionCount,
          },
        },
        { status: response.status }
      );
    }

    // Gebruik exact dezelfde response-vorm als de bewezen main-route.
    const predictions = result?.result?.outputs?.[0]?.predictions?.predictions || [];
    const imageInfo = result?.result?.outputs?.[0]?.predictions?.image || {};

    const boxes = Array.isArray(predictions)
      ? predictions
          .map((p: any) => ({
            x: Number(p.x),
            y: Number(p.y),
            width: Number(p.width),
            height: Number(p.height),
            confidence: Number(p.confidence) || 0,
            class: typeof p.class === "string" ? p.class : undefined,
          }))
          .filter((p: any) =>
            [p.x, p.y, p.width, p.height].every(Number.isFinite) &&
            p.width > 0 && p.height > 0
          )
      : [];

    const imageWidth = Number(imageInfo?.width) || null;
    const imageHeight = Number(imageInfo?.height) || null;

    const selectedMasks = imageWidth && imageHeight
      ? boxes.map((box: any) => {
          const left = Math.max(0, Math.floor(box.x - box.width / 2));
          const top = Math.max(0, Math.floor(box.y - box.height / 2));
          const right = Math.min(imageWidth, Math.ceil(box.x + box.width / 2));
          const bottom = Math.min(imageHeight, Math.ceil(box.y + box.height / 2));
          const width = Math.max(1, right - left);
          const height = Math.max(1, bottom - top);
          return { data: Array(width * height).fill(255), width, height, offsetX: left, offsetY: top };
        })
      : [];

    return NextResponse.json({
      ok: true,
      boxes,
      selectedMasks,
      imageWidth,
      imageHeight,
      roboflowStatus: response.status,
      segmentationType: "bounding-box",
      source: "main-workflow",
      diagnostics: {
        rawTopLevelKeys,
        nestedResultKeys,
        outputCount,
        outputKeys,
        predictionContainerKeys,
        predictionsIsArray,
        predictionCount,
        imageInfo,
        samplePrediction: predictionsIsArray && rawPredictions[0] ? {
          x: rawPredictions[0].x,
          y: rawPredictions[0].y,
          width: rawPredictions[0].width,
          height: rawPredictions[0].height,
          confidence: rawPredictions[0].confidence,
          class: rawPredictions[0].class,
        } : null,
      },
      message: boxes.length
        ? `Roboflow: ${boxes.length} kozijn(en) gevonden.`
        : "Roboflow gaf 0 kozijnen terug.",
    });
  } catch (error) {
    console.error("Roboflow kozijn detectie:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Onbekende fout bij Roboflow detectie." },
      { status: 500 }
    );
  }
}
