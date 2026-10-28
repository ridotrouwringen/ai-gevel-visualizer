import { projectUnitPoint, type PerspectivePoint } from "./perspective-warp";
import type { MountingMode } from "../types/visualizer";

// Fixed registration of the approved, cropped rolluik.png from test 2A.
// These are asset pixels, not physical dimensions. Never alter the source proportions.
export const ROLLUIK_ASSET = { width: 1264, height: 1090, left: 76, right: 1187, top: 150, bottom: 1089 } as const;

export function rolluikProductFootprint(frameQuad: PerspectivePoint[], mode: MountingMode = "OP_DE_DAG") {
  if (frameQuad.length !== 4 || frameQuad.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y))) {
    throw new Error("Vier geldige kozijnpunten zijn vereist.");
  }
  const crosses = frameQuad.map((p,i) => {
    const b=frameQuad[(i+1)%4], c=frameQuad[(i+2)%4];
    return (b.x-p.x)*(c.y-b.y)-(b.y-p.y)*(c.x-b.x);
  });
  if (crosses.some(v => v <= 1e-8)) throw new Error("De kozijnpunten moeten een geldige vierhoek vormen.");
  if (mode === "IN_DE_DAG") return frameQuad.map(p => ({...p}));
  if (mode !== "OP_DE_DAG") throw new Error("Ongeldige montagemethode.");
  const a = ROLLUIK_ASSET;
  return [[0,0],[a.width-1,0],[a.width-1,a.height-1],[0,a.height-1]].map(([x,y]) =>
    projectUnitPoint(frameQuad, {x:(x-a.left)/(a.right-a.left), y:(y-a.top)/(a.bottom-a.top)})
  );
}
