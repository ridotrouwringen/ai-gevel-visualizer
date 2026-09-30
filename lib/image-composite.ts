import sharp from "sharp";

export async function compositeGeneratedProduct(
  baseImage: Buffer,
  rgbProduct: Buffer,
  alpha: Buffer,
  width: number,
  height: number,
  left: number,
  top: number
) {
  const overlay = await sharp(rgbProduct, {
    raw: { width, height, channels: 3 },
  })
    .joinChannel(alpha, { raw: { width, height, channels: 1 } })
    .png()
    .toBuffer();

  return sharp(baseImage)
    .composite([{ input: overlay, left, top, blend: "over" }])
    .png()
    .toBuffer();
}
