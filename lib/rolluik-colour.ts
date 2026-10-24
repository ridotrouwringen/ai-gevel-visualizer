import type { SystemColor } from "../types/visualizer";
import { ROLLUIK_ASSET } from "./rolluik-placement";

/** Display-only paint variants of the approved, cropped asset. No geometry or alpha edits.
 * These fixed material regions belong to this asset, never to an individual facade.
 * Deep occlusion, solar module and metal fixings retain their original appearance.
 */
export function colourRolluikRgb(rgb: Buffer, alpha: Buffer, width: number, height: number, colour: SystemColor): Buffer {
  if (colour === "RAL_7016") return rgb;
  if (width !== ROLLUIK_ASSET.width || height !== ROLLUIK_ASSET.height || rgb.length !== width * height * 3 || alpha.length !== width * height) {
    throw new Error("De kleurregistratie vereist de goedgekeurde rolluikasset.");
  }
  const target = colour === "RAL_9010" ? [244, 244, 240]
    : colour === "RAL_9001" ? [232, 227, 215]
    : colour === "RAL_9005" ? [32, 33, 34] : null;
  if (!target) throw new Error("Onbekende rolluikkleur.");
  const out = Buffer.from(rgb);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = y * width + x, p = i * 3;
    if (!alpha[i]) continue;
    // Solar module including its dark mounting frame; screw heads on the cassette.
    if ((x >= 35 && x <= 539 && y >= 22 && y <= 89)
      || Math.hypot(x - 17, y - 83) <= 5 || Math.hypot(x - 1246, y - 83) <= 5) continue;
    const luminance = 0.2126 * rgb[p] + 0.7152 * rgb[p + 1] + 0.0722 * rgb[p + 2];
    const paint = Math.min(1, Math.max(0, (luminance - 10) / 18));
    const shade = Math.min(1.03, Math.pow(luminance / 105, 0.35));
    for (let c = 0; c < 3; c++) out[p + c] = Math.round(rgb[p + c] * (1 - paint) + Math.min(255, target[c] * shade) * paint);
  }
  return out;
}
