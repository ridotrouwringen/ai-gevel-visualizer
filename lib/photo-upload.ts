// Budget is for the encoded data URL, leaving room for masks and up to three
// existing product references below the 4.4 MB request preflight.
export const MAX_FACADE_DATA_URL_BYTES = 2_000_000;
export const MAX_FACADE_EDGE = 3200;
const MIN_FACADE_EDGE = 1024;
const JPEG_QUALITIES = [0.92, 0.86, 0.8] as const;
const SUPPORTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export type PreparedFacadePhoto = {
  dataUrl: string;
  width: number;
  height: number;
  optimized: boolean;
};
type Encoder = (width: number, height: number, quality: number) => Promise<string>;

/** Byte-budget policy, shared by browser encoding and real-codec tests.
 * Every candidate is encoded from the decoded original, never recompressed
 * from a previous candidate. Keep aspect ratio and never upscale.
 */
export async function fitFacadePhoto(width: number, height: number, encode: Encoder): Promise<PreparedFacadePhoto> {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1) {
    throw new Error('De foto heeft geen geldige afmetingen.');
  }
  const originalEdge = Math.max(width, height);
  let edge = Math.min(originalEdge, MAX_FACADE_EDGE);
  while (true) {
    const scale = edge / originalEdge;
    const w = Math.max(1, Math.round(width * scale));
    const h = Math.max(1, Math.round(height * scale));
    for (const quality of JPEG_QUALITIES) {
      const dataUrl = await encode(w, h, quality);
      if (!dataUrl.startsWith('data:image/jpeg;base64,')) throw new Error('De browser kon geen JPEG-werkfoto maken.');
      // JPEG/base64 consists of ASCII, so string length equals UTF-8 bytes.
      if (dataUrl.length <= MAX_FACADE_DATA_URL_BYTES) {
        return {dataUrl, width:w, height:h, optimized:true};
      }
    }
    const minimum = Math.min(originalEdge, MIN_FACADE_EDGE);
    if (edge <= minimum) throw new Error('Deze foto kon niet voldoende worden verkleind. Probeer een andere JPEG-foto.');
    edge = Math.max(minimum, Math.floor(edge * 0.85));
  }
}

function readDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === 'string'
      ? resolve(reader.result) : reject(new Error('De foto kon niet worden gelezen.'));
    reader.onerror = () => reject(new Error('De foto kon niet worden gelezen.'));
    reader.readAsDataURL(blob);
  });
}

/** Prepare once at upload, before any corner coordinates or raster masks exist.
 * Browser decoding applies EXIF orientation; canvas output has no EXIF rotation.
 */
export async function prepareFacadePhoto(file: File): Promise<PreparedFacadePhoto> {
  if (!SUPPORTED_TYPES.includes(file.type)) throw new Error('Kies een JPEG-, PNG- of WebP-foto.');
  const url = URL.createObjectURL(file);
  const image = new Image();
  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('De foto kon niet worden geopend. Probeer een andere JPEG-foto.'));
      image.src = url;
    });
    const width = image.naturalWidth, height = image.naturalHeight;
    // Small supported uploads keep their original bytes and existing EXIF path.
    if (Math.max(width, height) <= MAX_FACADE_EDGE && Math.ceil(file.size / 3) * 4 + 32 <= MAX_FACADE_DATA_URL_BYTES) {
      return {dataUrl:await readDataUrl(file), width, height, optimized:false};
    }
    const canvas = document.createElement('canvas');
    try {
      return await fitFacadePhoto(width, height, async (w, h, quality) => {
        canvas.width = w; canvas.height = h;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('De browser kon de foto niet voorbereiden.');
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, w, h);
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = 'high';
        context.drawImage(image, 0, 0, w, h);
        const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(
          result => result ? resolve(result) : reject(new Error('De browser kon de foto niet verkleinen.')), 'image/jpeg', quality,
        ));
        return readDataUrl(blob);
      });
    } finally {
      // Release the temporary pixel buffer, including on encoding failure.
      canvas.width = 0; canvas.height = 0;
    }
  } finally {
    image.src = '';
    URL.revokeObjectURL(url);
  }
}
