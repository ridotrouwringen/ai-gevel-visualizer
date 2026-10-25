import { inReferencePlane } from './rolluik-reference';
import { perspectiveWarpRgba, projectHomography, unitQuadHomography, type PerspectivePoint as Point } from './perspective-warp';
import type { MetricHints } from './facade-metric-hints';
import type { MountingMode } from '../types/visualizer';

// Product-owner specification, 20 October 2026. Approved material retained;
// its 45mm visual allowance is not an approved manufacturing specification.
export const COMPONENT_DIMENSIONS = { cassetteHeight:180, cassetteDepth:180, guideWidth:50, bottomAllowance:45 } as const;
type XYZ = [number,number,number];
type Face = { name:string; quad:Point[]; texture:[number,number,number,number]; shade?:number };
export type ComponentGeometry = {
  faces:Face[]; frameWidthBasis:number; frameHeightBasis:number;
  scaleSource:MetricHints['scaleSource']; cameraStatus:'assumed'|'unavailable'; metricStatus:'indicative';
  dimensions:typeof COMPONENT_DIMENSIONS; notes:string[]; curtainTextureRows?:number; referenceStatus?:'shared'|'separate-plane';
};
const length = (v:number[]) => Math.hypot(...v);
const dot = (a:number[],b:number[]) => a.reduce((s,v,i)=>s+v*b[i],0);
const cross = (a:number[],b:number[]) => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];

/** Camera hypothesis: centred principal point, square pixels, rectangular frame.
 * Admissibility is not calibration or confidence. Invalid/ill-conditioned poses
 * do not get an invented camera or outward projection.
 */
function camera(h:number[],iw:number,ih:number,H:number){
  const a=[h[0]-iw/2*h[6],h[3]-ih/2*h[6]], b=[h[1]-iw/2*h[7],h[4]-ih/2*h[7]];
  const denominator=h[6]*h[7];
  if(Math.abs(denominator)<1e-12)return null;
  const f2=-dot(a,b)/denominator,f=Math.sqrt(f2);
  if(!Number.isFinite(f)||f<iw*.2||f>iw*5)return null;
  const u=[a[0]/f,a[1]/f,h[6]],v=[b[0]/f,b[1]/f,h[7]],nu=length(u),nv=length(v);
  const r1=u.map(x=>x/nu),r2=v.map(x=>x/nv),r3=cross(r1,r2),t=[(h[2]-iw/2)/f,(h[5]-ih/2)/f,1].map(x=>x*H/nv);
  const W=H*nu/nv;
  const project=(p:XYZ)=>{
    const c=r1.map((r,i)=>r*p[0]+r2[i]*p[1]-r3[i]*p[2]+t[i]);
    if(c[2]<=1e-6||!c.every(Number.isFinite))throw Error('Product kruist de camera.');
    return {x:iw/2+f*c[0]/c[2],y:ih/2+f*c[1]/c[2]};
  };
  return {W,project};
}

export function rolluikComponentGeometry(quad:Point[],mode:MountingMode,iw:number,ih:number,hints:MetricHints,reference?:{quad:Point[];hints:MetricHints;mountingMode:MountingMode}):ComponentGeometry{
  if(mode!=='OP_DE_DAG'&&mode!=='IN_DE_DAG')throw Error('Ongeldige montagemethode.');
  if(quad.length!==4||quad.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)))throw Error('Vier geldige kozijnpunten vereist.');
  for(let i=0;i<4;i++){
    const a=quad[i],b=quad[(i+1)%4],c=quad[(i+2)%4];
    if((b.x-a.x)*(c.y-b.y)-(b.y-a.y)*(c.x-b.x)<=1e-8)throw Error('Ongeldige kozijncontour.');
  }
  const h=unitQuadHomography(quad);let known=hints.scaleSource==='repetition-60mm-assumption'&&hints.courseUnit!==null&&hints.courseUnit>0;
  // 1500 is an explicitly unmeasured style basis when no repeat cue exists.
  // It must never be emitted as a measured frame height.
  let H=known?60/hints.courseUnit!:1500;
  const screenW=(length([quad[1].x-quad[0].x,quad[1].y-quad[0].y])+length([quad[2].x-quad[3].x,quad[2].y-quad[3].y]))/2;
  const screenH=(length([quad[3].x-quad[0].x,quad[3].y-quad[0].y])+length([quad[2].x-quad[1].x,quad[2].y-quad[1].y]))/2;
  let pose=camera(h,iw,ih,H),W=pose?.W??H*screenW/screenH;
  let referenceHeight=H,referenceMode=mode,referenceStatus:ComponentGeometry['referenceStatus'];
  if(reference){
    const plane=inReferencePlane(reference.quad,quad);
    if(plane){
      const base=rolluikComponentGeometry(reference.quad,reference.mountingMode,iw,ih,reference.hints);
      referenceHeight=base.frameHeightBasis;referenceMode=reference.mountingMode;
      H=referenceHeight*plane.height;W=base.frameWidthBasis*plane.width;
      known=base.scaleSource==='repetition-60mm-assumption';referenceStatus='shared';
      const referencePose=camera(unitQuadHomography(reference.quad),iw,ih,referenceHeight);
      const origin=[plane.x*base.frameWidthBasis,plane.y*referenceHeight];
      pose=plane.x===0&&plane.y===0&&plane.width===1&&plane.height===1?referencePose:referencePose?{W,project:(p:XYZ)=>{
        const wall=projectHomography(h,{x:p[0]/W,y:p[1]/H});
        const front=referencePose.project([origin[0]+p[0],origin[1]+p[1],p[2]]),back=referencePose.project([origin[0]+p[0],origin[1]+p[1],0]);
        return {x:wall.x+front.x-back.x,y:wall.y+front.y-back.y};
      }}:null;
    }else referenceStatus='separate-plane';
  }
  const notes=['Indicatieve preview: schaal en camerahoek zijn niet gevalideerd. Geen maatberekening.'];
  notes.push(known?'De verhouding is gebaseerd op herhaling in de gevel met een aangenomen laaghoogte van 6 cm.':'Geen bruikbare schaalreferentie gevonden; productmaten worden alleen als visuele verhouding getoond.');
  if(referenceStatus==='shared')notes.push('Kast, geleiders en lamellen gebruiken dezelfde vaste verhouding op dit gevelvlak.');
  if(referenceStatus==='separate-plane')notes.push('Dit kozijn heeft een andere gevelrichting; de verhouding is afzonderlijk indicatief.');
  if(!Number.isFinite(H)||H<400||H>15000||!Number.isFinite(W)||W<250||W>20000)throw Error('De geschatte schaal is niet bruikbaar. Kies een duidelijker kozijn.');
  const rect=(x0:number,y0:number,x1:number,y1:number,z=0):XYZ[]=>[[x0,y0,z],[x1,y0,z],[x1,y1,z],[x0,y1,z]];
  const planar=(p:XYZ)=>projectHomography(h,{x:p[0]/W,y:p[1]/H});
  // No extra depth is inferred for guides, curtain or the actual recess.
  const make=(depth:boolean)=>{
    const faces:Face[]=[],P=depth&&pose?pose.project:planar;
    const add=(name:string,points:XYZ[],texture:Face['texture'],shade?:number)=>faces.push({name,quad:points.map(P),texture,...(shade===undefined?{}:{shade})});
    const inside=mode==='IN_DE_DAG',g=COMPONENT_DIMENSIONS.guideWidth,b=COMPONENT_DIMENSIONS.bottomAllowance,box=COMPONENT_DIMENSIONS.cassetteHeight;
    const x0=inside?g:0,x1=inside?W-g:W,y0=inside?box:0;
    add('curtain',rect(x0,y0,x1,H-b),[76,150,1111,885]);
    add('bottom',rect(x0,H-b,x1,H),[76,1035,1111,54]);
    add('left-guide',rect(inside?0:-g,y0,inside?g:0,H),[24,150,52,940]);
    add('right-guide',rect(inside?W-g:W,y0,inside?W:W+g,H),[1187,150,52,940]);
    const back=rect(inside?0:-g,inside?0:-box,inside?W:W+g,inside?box:0);
    const front=back.map(p=>[p[0],p[1],inside?0:COMPONENT_DIMENSIONS.cassetteDepth] as XYZ);
    if(depth&&!inside){
      for(const [i,j,tone] of [[0,1,1.12],[1,2,.82],[2,3,.65],[3,0,.92]]){
        const points=[back[i],back[j],front[j],front[i]],q=points.map(P);
        const area=Math.abs(q.reduce((s,p,k)=>s+p.x*q[(k+1)%4].y-p.y*q[(k+1)%4].x,0))/2;
        if(area>.1)add('cassette-side',points,[600,95,16,16],tone);
      }
    }
    add('cassette-front',depth?front:back,[0,0,1264,150]);
    return faces;
  };
  let faces:Face[];
  try{
    faces=make(Boolean(pose)&&mode==='OP_DE_DAG');
    if(faces.some(f=>f.quad.some(p=>Math.abs(p.x)>iw*4||Math.abs(p.y)>ih*4)))throw Error('Onveilige projectie.');
  }catch{pose=null;W=H*screenW/screenH;faces=make(false);}
  if(!pose&&mode==='OP_DE_DAG')notes.push('De diepte van de kast kan bij deze foto niet betrouwbaar worden geprojecteerd en is vlak weergegeven.');
  if(mode==='IN_DE_DAG')notes.push('De werkelijke diepte van de negge is niet uit de foto vastgesteld.');
  const bodyHeight=H-COMPONENT_DIMENSIONS.bottomAllowance-(mode==='IN_DE_DAG'?COMPONENT_DIMENSIONS.cassetteHeight:0);
  const referenceBody=referenceHeight-COMPONENT_DIMENSIONS.bottomAllowance-(referenceMode==='IN_DE_DAG'?COMPONENT_DIMENSIONS.cassetteHeight:0);
  const curtainTextureRows=referenceStatus==='shared'?Math.max(2,Math.round(885*bodyHeight/referenceBody)):885;
  if(curtainTextureRows>12000)throw Error('De hoogteverhouding is te groot voor een betrouwbare preview.');
  return {faces,curtainTextureRows,referenceStatus,frameWidthBasis:W,frameHeightBasis:H,scaleSource:known?'repetition-60mm-assumption':'unknown',cameraStatus:pose?'assumed':'unavailable',metricStatus:'indicative',dimensions:COMPONENT_DIMENSIONS,notes};
}

/** One silhouette overlay, retaining source materials and reference lamella pitch.
 * Render bounds are clipped before allocation; individual face warps are bounded
 * too. Source RGB and alpha always follow the same crop and projection.
 */
export function renderRolluikComponents(rgb:Buffer,alpha:Buffer,geometry:ComponentGeometry,iw:number,ih:number,options?:{filterRgb?:boolean}){
  if(rgb.length!==1264*1090*3||alpha.length!==1264*1090)throw Error('Onbekende rolluikasset.');
  const all=geometry.faces.flatMap(f=>f.quad);
  const left=Math.max(0,Math.floor(Math.min(...all.map(p=>p.x)))),top=Math.max(0,Math.floor(Math.min(...all.map(p=>p.y))));
  const right=Math.min(iw,Math.ceil(Math.max(...all.map(p=>p.x)))+1),bottom=Math.min(ih,Math.ceil(Math.max(...all.map(p=>p.y)))+1);
  const width=Math.max(1,right-left),height=Math.max(1,bottom-top),out=Buffer.alloc(width*height*4);
  if(right<=left||bottom<=top)return {rgb:Buffer.alloc(3),alpha:Buffer.alloc(1),width:1,height:1,left:0,top:0};
  for(const face of geometry.faces){
    const [x,y,w,sourceHeight]=face.texture,hh=face.name==='curtain'?(geometry.curtainTextureRows??sourceHeight):sourceHeight;
    const crgb=Buffer.alloc(w*hh*3),ca=Buffer.alloc(w*hh);
    for(let yy=0;yy<hh;yy++)for(let xx=0;xx<w;xx++){
      // Continue the approved curtain texture at its existing pitch. The lower
      // 623-source-pixel block contains 15 full lamella cycles; top details
      // remain once, and only additional rows repeat for a taller product.
      const row=yy<sourceHeight?yy:sourceHeight-623+(yy-sourceHeight)%623;
      const s=(y+row)*1264+x+xx,d=yy*w+xx;ca[d]=face.shade===undefined?alpha[s]:255;
      for(let c=0;c<3;c++)crgb[d*3+c]=Math.min(255,Math.round(rgb[s*3+c]*(face.shade??1)));
    }
    const warped=perspectiveWarpRgba(crgb,ca,w,hh,face.quad,{left,top,right,bottom},options?.filterRgb);
    for(let yy=0;yy<warped.height;yy++)for(let xx=0;xx<warped.width;xx++){
      const dx=warped.offsetX+xx-left,dy=warped.offsetY+yy-top;if(dx<0||dy<0||dx>=width||dy>=height)continue;
      const s=(yy*warped.width+xx)*4,d=(dy*width+dx)*4,sa=warped.rgba[s+3]/255,da=out[d+3]/255,a=sa+da*(1-sa);
      if(!a)continue;
      for(let c=0;c<3;c++)out[d+c]=Math.round((warped.rgba[s+c]*sa+out[d+c]*da*(1-sa))/a);
      out[d+3]=Math.round(a*255);
    }
  }
  const productRgb=Buffer.alloc(width*height*3),productAlpha=Buffer.alloc(width*height);
  for(let i=0;i<productAlpha.length;i++){productAlpha[i]=out[i*4+3];for(let c=0;c<3;c++)productRgb[i*3+c]=out[i*4+c];}
  return {rgb:productRgb,alpha:productAlpha,width,height,left,top};
}
