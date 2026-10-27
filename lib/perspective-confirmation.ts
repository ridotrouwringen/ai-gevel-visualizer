/** Selection-led direction checks. Never modifies the user's points or render. */
export type Point = { x:number; y:number };
export type ImageSegment = { start:Point; end:Point; strength:number };
export type SupportingLine = ImageSegment & { errorDegrees:number; source:'nearby'|'building' };
export type DirectionCheck = { status:'supported'|'limited'|'unconfirmed'; lines:SupportingLine[] };
export type PerspectiveConfirmation = {
  coordinates:Point[]; horizontal:DirectionCheck; vertical:DirectionCheck;
  analysisWidth:number; analysisHeight:number;
};
type Vector = [number,number,number];
const cross=(a:Vector,b:Vector):Vector=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const line=(a:Point,b:Point):Vector=>cross([a.x,a.y,1],[b.x,b.y,1]);
const length=(s:ImageSegment)=>Math.hypot(s.end.x-s.start.x,s.end.y-s.start.y);

export function validatePerspectiveCoordinates(value:unknown):Point[] {
  if(!Array.isArray(value)||value.length!==4||value.some(p=>!p||!Number.isFinite(p.x)||!Number.isFinite(p.y)||p.x<0||p.x>1||p.y<0||p.y>1))throw Error('Wijs vier geldige kozijnhoeken aan: linksboven, rechtsboven, rechtsonder, linksonder.');
  const q=value as Point[];
  for(let i=0;i<4;i++){
    const a=q[i],b=q[(i+1)%4],c=q[(i+2)%4];
    if((b.x-a.x)*(c.y-b.y)-(b.y-a.y)*(c.x-b.x)<=1e-8)throw Error('De vier hoekpunten moeten in volgorde om het kozijn liggen.');
  }
  return q.map(p=>({x:p.x,y:p.y}));
}

/** Independent image extraction: gradient-directed Hough votes + continuous
 * edge support + a least-squares segment. No selection/quad enters detection.
 * This small CPU detector is a separate integration version, not the Python LSD benchmark.
 */
export function detectFacadeLines(gray:Uint8Array,width:number,height:number):ImageSegment[] {
  if(gray.length!==width*height||width<3||height<3||width*height>1_000_000)throw Error('Ongeldige analyseafmetingen.');
  const magnitude=new Float32Array(gray.length),orientation=new Float32Array(gray.length);
  for(let y=1;y<height-1;y++)for(let x=1;x<width-1;x++){
    const i=y*width+x;
    const gx=-gray[i-width-1]+gray[i-width+1]-2*gray[i-1]+2*gray[i+1]-gray[i+width-1]+gray[i+width+1];
    const gy=-gray[i-width-1]-2*gray[i-width]-gray[i-width+1]+gray[i+width-1]+2*gray[i+width]+gray[i+width+1];
    magnitude[i]=Math.hypot(gx,gy)/4;
    let a=Math.atan2(gy,gx);if(a<0)a+=Math.PI;if(a>=Math.PI)a-=Math.PI;
    orientation[i]=a;
  }
  const edges:{x:number;y:number;a:number;m:number}[]=[];
  for(let y=2;y<height-2;y++)for(let x=2;x<width-2;x++){
    const i=y*width+x,m=magnitude[i];if(m<18)continue;
    const a=orientation[i],dx=Math.round(Math.cos(a)),dy=Math.round(Math.sin(a));
    if(m<magnitude[i+dy*width+dx]||m<=magnitude[i-dy*width-dx])continue;
    edges.push({x,y,a,m});
  }
  // Deterministic spatial sampling bounds work on heavily textured photos.
  const stride=Math.max(1,Math.ceil(edges.length/24000));
  const samples=edges.filter((_,i)=>i%stride===0);
  if(samples.length<20)return [];
  const ntheta=360,diag=Math.ceil(Math.hypot(width,height)),nrho=diag+1;
  const votes=new Float32Array(ntheta*nrho);
  const cos=Array.from({length:ntheta},(_,i)=>Math.cos(i*Math.PI/ntheta));
  const sin=Array.from({length:ntheta},(_,i)=>Math.sin(i*Math.PI/ntheta));
  for(const e of samples){
    const bin=Math.round(e.a/Math.PI*ntheta);
    for(let delta=-1;delta<=1;delta++){
      const t=(bin+delta+ntheta)%ntheta,r=Math.round((e.x*cos[t]+e.y*sin[t]+diag)/2);
      if(r>=0&&r<nrho)votes[t*nrho+r]+=Math.min(4,e.m/18);
    }
  }
  const peaks:{t:number;r:number;score:number}[]=[];
  for(let t=0;t<ntheta;t++)for(let r=2;r<nrho-2;r++){
    const score=votes[t*nrho+r];if(score<22)continue;
    let max=true;
    for(let dt=-1;dt<=1&&max;dt++)for(let dr=-2;dr<=2;dr++){
      const tt=t+dt;if(tt<0||tt>=ntheta||(!dt&&!dr))continue;
      const other=votes[tt*nrho+r+dr];
      if(other>score||(other===score&&(dt<0||(!dt&&dr<0)))){max=false;break;}
    }
    if(max)peaks.push({t,r,score});
  }
  peaks.sort((a,b)=>b.score-a.score);
  const segments:ImageSegment[]=[];
  for(const peak of peaks.slice(0,180)){
    const nx=cos[peak.t],ny=sin[peak.t],rho=peak.r*2-diag;
    const points:{x:number;y:number;t:number}[]=[];
    for(const e of samples){
      const da=Math.abs(e.a-peak.t*Math.PI/ntheta);
      if(Math.min(da,Math.PI-da)>Math.PI/30||Math.abs(e.x*nx+e.y*ny-rho)>1.8)continue;
      points.push({x:e.x,y:e.y,t:-e.x*ny+e.y*nx});
    }
    points.sort((a,b)=>a.t-b.t);
    let begin=0;
    for(let end=1;end<=points.length;end++){
      if(end<points.length&&points[end].t-points[end-1].t<=6)continue;
      const run=points.slice(begin,end);begin=end;
      if(run.length<12)continue;
      const span=run[run.length-1].t-run[0].t;
      const occupied=new Set(run.map(p=>Math.floor((p.t-run[0].t)/2))).size;
      if(span<22||occupied/(span/2+1)<.5)continue;
      const mx=run.reduce((s,p)=>s+p.x,0)/run.length,my=run.reduce((s,p)=>s+p.y,0)/run.length;
      let xx=0,xy=0,yy=0;
      for(const p of run){xx+=(p.x-mx)**2;xy+=(p.x-mx)*(p.y-my);yy+=(p.y-my)**2;}
      const angle=.5*Math.atan2(2*xy,xx-yy),dx=Math.cos(angle),dy=Math.sin(angle);
      const projections=run.map(p=>(p.x-mx)*dx+(p.y-my)*dy),lo=Math.min(...projections),hi=Math.max(...projections);
      const segment={start:{x:mx+lo*dx,y:my+lo*dy},end:{x:mx+hi*dx,y:my+hi*dy},strength:occupied/(span/2+1)};
      if(!segments.some(s=>sameSupportingLine(s,segment,3)))segments.push(segment);
    }
  }
  return segments.sort((a,b)=>length(b)-length(a)).slice(0,240);
}

function sameSupportingLine(a:ImageSegment,b:ImageSegment,distance:number):boolean{
  const ax=a.end.x-a.start.x,ay=a.end.y-a.start.y,bx=b.end.x-b.start.x,by=b.end.y-b.start.y;
  const la=Math.hypot(ax,ay),lb=Math.hypot(bx,by);if(!la||!lb)return true;
  if(Math.abs(ax*by-ay*bx)/(la*lb)>Math.sin(Math.PI/120))return false;
  return Math.max(Math.abs((b.start.x-a.start.x)*ay-(b.start.y-a.start.y)*ax),Math.abs((b.end.x-a.start.x)*ay-(b.end.y-a.start.y)*ax))/la<distance;
}

/** Use the two authoritative selection edges to define each vanishing direction.
 * Confirm it with OTHER image lines; no fitting or snapping of P1-P4 occurs.
 * Parallel edges are handled homogeneously (vanishing point at infinity).
 */
export function confirmSelectionPerspective(segments:ImageSegment[],coordinates:Point[],width:number,height:number):PerspectiveConfirmation {
  const source=validatePerspectiveCoordinates(coordinates);
  const q=source.map(p=>({x:p.x*width,y:p.y*height}));
  const edges=q.map((p,i)=>({start:p,end:q[(i+1)%4],strength:1}));
  const center={x:q.reduce((s,p)=>s+p.x,0)/4,y:q.reduce((s,p)=>s+p.y,0)/4};
  const targetSize=Math.max(1,Math.hypot(q[2].x-q[0].x,q[2].y-q[0].y));
  const check=(a:number,b:number):DirectionCheck=>{
    const vp=cross(line(edges[a].start,edges[a].end),line(edges[b].start,edges[b].end));
    const norm=Math.hypot(...vp);if(norm<1e-10)return {status:'unconfirmed',lines:[]};
    const v=vp.map(n=>n/norm);
    const candidates:{segment:ImageSegment;error:number;distance:number;band:number}[]=[];
    for(const segment of segments){
      if(sameSupportingLine(edges[a],segment,4)||sameSupportingLine(edges[b],segment,4))continue;
      const mid={x:(segment.start.x+segment.end.x)/2,y:(segment.start.y+segment.end.y)/2};
      const rx=v[0]-mid.x*v[2],ry=v[1]-mid.y*v[2],sx=segment.end.x-segment.start.x,sy=segment.end.y-segment.start.y;
      const den=Math.hypot(rx,ry)*Math.hypot(sx,sy);if(den<1e-10)continue;
      const error=Math.asin(Math.min(1,Math.abs(rx*sy-ry*sx)/den))*180/Math.PI;
      if(error>1.5)continue;
      const distance=Math.hypot(mid.x-center.x,mid.y-center.y)/targetSize;
      candidates.push({segment,error,distance,band:distance<=2?0:distance<=5?1:2});
    }
    candidates.sort((a,b)=>a.band-b.band||(a.error+a.distance*.12-length(a.segment)/Math.max(width,height)*.2)-(b.error+b.distance*.12-length(b.segment)/Math.max(width,height)*.2));
    const kept:typeof candidates=[];
    for(const c of candidates){
      if(!kept.some(k=>sameSupportingLine(k.segment,c.segment,5)))kept.push(c);
      if(kept.length===5)break;
    }
    const lines=kept.map(c=>({start:{x:c.segment.start.x/width,y:c.segment.start.y/height},end:{x:c.segment.end.x/width,y:c.segment.end.y/height},strength:c.segment.strength,errorDegrees:c.error,source:c.band===0?'nearby' as const:'building' as const}));
    return {status:lines.length>=2?'supported':lines.length?'limited':'unconfirmed',lines};
  };
  return {coordinates:source,horizontal:check(0,2),vertical:check(1,3),analysisWidth:width,analysisHeight:height};
}
