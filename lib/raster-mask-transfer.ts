import type { MaskShape } from "../types/visualizer";

type RasterMask = NonNullable<MaskShape["rasterMasks"]>[number];
export type TransferRasterMask = RasterMask | (Omit<RasterMask, "data"> & { dataRle: number[] });

/** Lossless transport only; stored masks and their pixel geometry never change. */
export function packRasterMask(mask: RasterMask): TransferRasterMask {
  const dataRle: number[] = [];
  for (let i = 0; i < mask.data.length;) {
    const value = mask.data[i];
    let end = i + 1;
    while (end < mask.data.length && mask.data[end] === value) end++;
    dataRle.push(value, end - i);
    i = end;
  }
  // Keep the existing format for highly fragmented masks.
  if (dataRle.length >= mask.data.length) return mask;
  const { data: _data, ...geometry } = mask;
  return { ...geometry, dataRle };
}

export function unpackRasterMask(mask: TransferRasterMask, maxPixels: number): RasterMask {
  if ("data" in mask) return mask;
  const pixels = mask.width * mask.height;
  if (!Number.isSafeInteger(mask.width) || mask.width < 1
    || !Number.isSafeInteger(mask.height) || mask.height < 1
    || !Number.isSafeInteger(pixels) || pixels > maxPixels
    || !Array.isArray(mask.dataRle) || mask.dataRle.length === 0 || mask.dataRle.length % 2 !== 0) {
    throw new Error("De gecomprimeerde selectie is ongeldig.");
  }
  // Validate before allocating the decoded mask.
  let size = 0;
  for (let i = 0; i < mask.dataRle.length; i += 2) {
    const value = mask.dataRle[i], count = mask.dataRle[i + 1];
    if (!Number.isInteger(value) || value < 0 || value > 255
      || !Number.isSafeInteger(count) || count <= 0 || count > pixels - size) {
      throw new Error("De gecomprimeerde selectie is ongeldig.");
    }
    size += count;
  }
  if (size !== pixels) throw new Error("De gecomprimeerde selectie is onvolledig.");
  const data = new Array<number>(pixels);
  let offset = 0;
  for (let i = 0; i < mask.dataRle.length; i += 2) {
    data.fill(mask.dataRle[i], offset, offset + mask.dataRle[i + 1]);
    offset += mask.dataRle[i + 1];
  }
  const { dataRle: _dataRle, ...geometry } = mask;
  return { ...geometry, data };
}
