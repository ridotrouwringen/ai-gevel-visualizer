// Leave headroom below Vercel's 4.5 MB request limit. No photo resampling.
const MAX_REQUEST_BYTES = 4_400_000;
const TOO_LARGE = "De foto en selecties zijn samen te groot om te versturen. Gebruik een foto met een kleinere bestandsgrootte (bijvoorbeeld JPEG) of minder productreferenties.";

export function serializeGenerationRequest(payload: unknown): string {
  const body = JSON.stringify(payload);
  if (new TextEncoder().encode(body).byteLength > MAX_REQUEST_BYTES) throw new Error(TOO_LARGE);
  return body;
}

export async function readGenerationResponse(response: Response): Promise<{ imageUrl?: string; previewNotes?: string[] }> {
  // Gateways may return plain text or HTML before the route handler runs.
  const text = await response.text();
  if (response.status === 413 || /^Request Entity Too Large/i.test(text.trim())) throw new Error(TOO_LARGE);
  let data: unknown;
  try { data = JSON.parse(text); }
  catch {
    throw new Error(`De server kon de visualisatie niet verwerken (HTTP ${response.status}). Probeer het opnieuw.`);
  }
  if (!response.ok) {
    const message = data && typeof data === "object" && "error" in data ? data.error : null;
    throw new Error(typeof message === "string" ? message : `Genereren mislukt (HTTP ${response.status}).`);
  }
  if (!data || typeof data !== "object" || !("imageUrl" in data) || typeof data.imageUrl !== "string") {
    throw new Error("Geen afbeelding ontvangen van de server.");
  }
  return { imageUrl: data.imageUrl, ...("previewNotes" in data && Array.isArray(data.previewNotes) && data.previewNotes.every((note:unknown) => typeof note === "string") ? {previewNotes:data.previewNotes} : {}) };
}
