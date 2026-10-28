import type { MasonryResult } from './masonry-courses';

// Final preflight after upload-time photo preparation; never change masks or
// image dimensions here, after the user has selected corner coordinates.
const MAX_REQUEST_BYTES = 4_400_000;
const TOO_LARGE = "De foto en selecties zijn samen te groot om te versturen. Gebruik een foto met een kleinere bestandsgrootte (bijvoorbeeld JPEG) of minder productreferenties.";

export function serializeGenerationRequest(payload: unknown): string {
  const body = JSON.stringify(payload);
  if (new TextEncoder().encode(body).byteLength > MAX_REQUEST_BYTES) throw new Error(TOO_LARGE);
  return body;
}

export async function readGenerationResponse(response: Response): Promise<{ imageUrl?: string; previewNotes?: string[]; results?: {id:string;masonry:MasonryResult}[] }> {
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
  const results='results' in data&&Array.isArray(data.results)?data.results.filter((r):r is {id:string;masonry:MasonryResult}=>
    r&&typeof r.id==='string'&&r.masonry&&Array.isArray(r.masonry.coordinates)&&r.masonry.coordinates.length===4&&Array.isArray(r.masonry.patches)&&
    ['agreement','limited','unconfirmed'].includes(r.masonry.status)&&
    (r.masonry.layersOverSelection===null||Number.isFinite(r.masonry.layersOverSelection))):undefined;
  return { imageUrl: data.imageUrl, ...(results?{results}:{}), ...("previewNotes" in data && Array.isArray(data.previewNotes) && data.previewNotes.every((note:unknown) => typeof note === "string") ? {previewNotes:data.previewNotes} : {}) };
}
