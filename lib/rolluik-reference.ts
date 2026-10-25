import { unitQuadHomography, projectHomography, type PerspectivePoint as Point } from './perspective-warp';
import type { MountingMode } from '../types/visualizer';
export type RolluikReference = { coordinates:Point[]; mountingMode:MountingMode };
/** Freeze once per uploaded work photo. Changing/removing a selection must not
 * recalibrate all other shutters. This is a visual reference, not a measurement.
 */
export function retainRolluikReference(previous:{image:string;reference:RolluikReference}|null,image:string,candidates:RolluikReference[]){
  if(previous?.image===image)return previous;
  return candidates.length?{image,reference:{coordinates:candidates[0].coordinates.map(p=>({...p})),mountingMode:candidates[0].mountingMode}}:null;
}
export function validateRolluikReference(value:unknown):RolluikReference|null{
  if(value===undefined||value===null)return null;
  if(typeof value!=='object')throw Error('Ongeldige gevelreferentie.');
  const v=value as RolluikReference;
  if(!Array.isArray(v.coordinates)||v.coordinates.length!==4||v.coordinates.some(p=>!p||!Number.isFinite(p.x)||!Number.isFinite(p.y)||p.x<0||p.x>1||p.y<0||p.y>1)||(v.mountingMode!=='IN_DE_DAG'&&v.mountingMode!=='OP_DE_DAG'))throw Error('Ongeldige gevelreferentie.');
  const q=v.coordinates;
  for(let i=0;i<4;i++){const a=q[i],b=q[(i+1)%4],c=q[(i+2)%4];if((b.x-a.x)*(c.y-b.y)-(b.y-a.y)*(c.x-b.x)<=1e-10)throw Error('Ongeldige gevelreferentie.');}
  unitQuadHomography(q);
  return v;
}
/** Recover reference-plane coordinates with an inverse 3x3 homography. Reject
 * other facade orientations instead of pretending they share this wall plane.
 */
export function inReferencePlane(reference:Point[],quad:Point[]){
  const [a,b,c,d,e,f,g,h,i]=unitQuadHomography(reference);
  const inv=[e*i-f*h,c*h-b*i,b*f-c*e,f*g-d*i,a*i-c*g,c*d-a*f,d*h-e*g,b*g-a*h,a*e-b*d];
  if(Math.abs(inv[8])<1e-12)return null;
  const norm=inv.map(x=>x/inv[8]);
  let q:Point[];try{q=quad.map(p=>projectHomography(norm,p));}catch{return null;}
  const width=((q[1].x-q[0].x)+(q[2].x-q[3].x))/2,height=((q[3].y-q[0].y)+(q[2].y-q[1].y))/2;
  if(width<=0||height<=0)return null;
  const error=Math.max(Math.abs(q[1].y-q[0].y)/height,Math.abs(q[2].y-q[3].y)/height,Math.abs(q[3].x-q[0].x)/width,Math.abs(q[2].x-q[1].x)/width);
  const snap=(v:number)=>Math.abs(v)<1e-10?0:Math.abs(v-1)<1e-10?1:v;
  return error<=.08?{width:snap(width),height:snap(height),x:snap((q[0].x+q[3].x)/2),y:snap((q[0].y+q[1].y)/2)}:null;
}
