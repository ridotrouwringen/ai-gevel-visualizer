import sharp from "sharp";

/** Match the browser's EXIF-oriented coordinate space before building masks.
 * Materialize once, losslessly; applying autoOrient only at the final composite
 * would leave selection dimensions and foreground pixels in the wrong space.
 */
export async function orientFacadePhoto(input: Buffer): Promise<Buffer> {
  const { orientation } = await sharp(input).metadata();
  if (!orientation || orientation === 1) return input;
  return sharp(input).autoOrient().png().toBuffer();
}
