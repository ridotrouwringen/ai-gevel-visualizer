import type { MaskShape } from "@/types/visualizer";

type RasterMask = NonNullable<MaskShape["rasterMasks"]>[number];

export function buildLineMask(width: number, height: number, coordinates: { x: number; y: number }[]) {
  const [start, end] = coordinates;
  const left = Math.max(0, Math.min(start.x, end.x));
  const right = Math.min(1, Math.max(start.x, end.x));
  const top = Math.max(0, Math.min(start.y, end.y));
  const bottom = Math.min(1, top + 0.20);
  const data = Buffer.alloc(width * height);
  for (let y = Math.floor(top * height); y < Math.ceil(bottom * height); y++) {
    for (let x = Math.floor(left * width); x < Math.ceil(right * width); x++) data[y * width + x] = 255;
  }
  return data;
}

export function buildRasterMask(width: number, height: number, masks: RasterMask[]) {
  const data = Buffer.alloc(width * height);
  for (const mask of masks) for (let y = 0; y < mask.height; y++) for (let x = 0; x < mask.width; x++) {
    const targetX = mask.offsetX + x, targetY = mask.offsetY + y;
    if (targetX >= 0 && targetX < width && targetY >= 0 && targetY < height && Number(mask.data[y * mask.width + x] ?? 0) > 0) data[targetY * width + targetX] = 255;
  }
  return data;
}

export function getSelectionBounds(maskRaw: Buffer, width: number, height: number) {
  let left = width, top = height, right = -1, bottom = -1;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (maskRaw[y * width + x] > 0) {
    left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y);
  }
  if (right < left || bottom < top) throw new Error("De geselecteerde mask bevat geen actieve pixels.");
  return { left, top, right: right + 1, bottom: bottom + 1 };
}
