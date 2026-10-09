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
  const base = await sharp(baseImage).metadata();
  const cropLeft = Math.max(0, -left), cropTop = Math.max(0, -top);
  const cropWidth = Math.min(width - cropLeft, (base.width ?? 0) - Math.max(0, left));
  const cropHeight = Math.min(height - cropTop, (base.height ?? 0) - Math.max(0, top));
  if (cropWidth <= 0 || cropHeight <= 0) return baseImage;
  // Materialize RGBA before extraction: Sharp applies extract before joinChannel,
  // otherwise cropped RGB is joined to the uncropped alpha plane.
  const rgba = await sharp(rgbProduct, {
    raw: { width, height, channels: 3 },
  })
    .joinChannel(alpha, { raw: { width, height, channels: 1 } })
    .raw()
    .toBuffer();
  const overlay = await sharp(rgba, { raw: { width, height, channels: 4 } })
    .extract({left:cropLeft,top:cropTop,width:cropWidth,height:cropHeight})
    .png()
    .toBuffer();

  return sharp(baseImage)
    .composite([{ input: overlay, left:Math.max(0,left), top:Math.max(0,top), blend: "over" }])
    .png()
    .toBuffer();
}
