import { validatePerspectiveCoordinates, type Point } from './perspective-confirmation';
import { unitQuadHomography, projectHomography } from './perspective-warp';

export type CourseProfile = { period:number; joints:number[]; intervals:number; regularity:number };
export type MasonryPatch = {
  id:string; label:string; polygon:Point[]; joints:{start:Point;end:Point}[];
  intervals:number; period:number|null; regularity:number; reason:string|null;
};
export type MasonryResult = {
  coordinates:Point[]; width:number; height:number; patches:MasonryPatch[];
  status:'agreement'|'limited'|'unconfirmed'; agreeingPatches:number; layersOverSelection:number|null;
};
const median=(a:number[])=>{const b=[...a].sort((x,y)=>x-y);return b.length?(b[Math.floor((b.length-1)/2)]+b[Math.floor(b.length/2)])/2:0;};

/** Repetition detector only: it cannot distinguish masonry from horizontal cladding.
 * Counts actual observed joint peaks. Missing peaks are never filled in.
 * One peak per course prevents counting both sides of a mortar joint as two layers.
 */
export function detectCourseProfile(bands:number[][]):CourseProfile|null {
  const n=bands[0]?.length??0;
  if(bands.length<3||n<40||bands.some(b=>b.length!==n||b.some(v=>!Number.isFinite(v))))return null;
  const signals=bands.map(b=>b.map((v,i)=>{
    let sum=0,count=0;
    for(let j=Math.max(0,i-12);j<=Math.min(n-1,i+12);j++){sum+=b[j];count++;}
    return v-sum/count;
  }));
  const mean=Array.from({length:n},(_,i)=>signals.reduce((s,b)=>s+b[i],0)/signals.length);
  const rms=Math.sqrt(mean.reduce((s,v)=>s+v*v,0)/n);
  if(rms<2)return null;
  const correlations:{lag:number;score:number}[]=[];
  for(let lag=4;lag<=Math.min(80,Math.floor(n/5));lag++){
    let dot=0,a=0,b=0;
    for(let i=12;i<n-lag-12;i++){dot+=mean[i]*mean[i+lag];a+=mean[i]**2;b+=mean[i+lag]**2;}
    correlations.push({lag,score:dot/Math.max(1,Math.sqrt(a*b))});
  }
  const peaks=correlations.filter((c,i)=>i>0&&i<correlations.length-1&&c.score>=.35&&c.score>=correlations[i-1].score&&c.score>correlations[i+1].score);
  if(!peaks.length)return null;
  const best=Math.max(...peaks.map(p=>p.score));
  const period=peaks.find(p=>p.score>=Math.max(.35,best*.85))!.lag;
  let winner:CourseProfile|null=null,winningScore=0;
  for(const polarity of [1,-1]){
    const candidates:number[]=[];
    for(let i=3;i<n-3;i++){
      const value=polarity*mean[i];
      if(value<rms*.45||value<polarity*mean[i-1]||value<=polarity*mean[i+1])continue;
      const radius=Math.max(1,Math.round(period*.12));
      const agreement=signals.filter(b=>{
        let max=-Infinity;for(let j=i-radius;j<=i+radius;j++)if(j>=0&&j<n)max=Math.max(max,polarity*b[j]);
        return max>=rms*.35;
      }).length;
      if(agreement>=2)candidates.push(i);
    }
    candidates.sort((a,b)=>polarity*(mean[b]-mean[a]));
    const kept:number[]=[];
    for(const p of candidates)if(!kept.some(k=>Math.abs(k-p)<period*.65))kept.push(p);
    kept.sort((a,b)=>a-b);
    const tolerance=Math.max(1.5,period*.2);
    const isInterval=(gap:number)=>Math.abs(gap-period)<=tolerance;
    const joints=kept.filter((p,i)=>i>0&&isInterval(p-kept[i-1])||i+1<kept.length&&isInterval(kept[i+1]-p));
    if(joints.length<5)continue;
    const gaps=joints.slice(1).map((p,i)=>p-joints[i]);
    const intervals=gaps.filter(isInterval).length,regularity=intervals/gaps.length;
    if(regularity<.65)continue;
    const strength=joints.reduce((s,i)=>s+polarity*mean[i],0)/joints.length;
    const score=intervals*regularity*strength;
    if(score>winningScore){winningScore=score;winner={period:median(gaps.filter(isInterval)),joints,intervals,regularity};}
  }
  return winner;
}

/** Sample local rectified wall strips using the uploaded work-photo pixels.
 * Quad homography supplies relative projective coordinates, never millimetres.
 * Sampling is bounded and does not upscale to invent extra source detail.
 */
export function countMasonryCourses(gray:Uint8Array,width:number,height:number,coordinates:Point[]):MasonryResult {
  const q=validatePerspectiveCoordinates(coordinates);
  if(gray.length!==width*height||width<3||height<3)throw Error('Ongeldige fotoafmetingen.');
  const pixels=q.map(p=>({x:p.x*width,y:p.y*height}));
  const h=unitQuadHomography(pixels);
  const edge=(a:number,b:number)=>Math.hypot(pixels[a].x-pixels[b].x,pixels[a].y-pixels[b].y);
  const unitWidth=(edge(0,1)+edge(3,2))/2,unitHeight=(edge(0,3)+edge(1,2))/2;
  const specs=[
    {id:'left-near',label:'Links dichtbij',u0:-.38,u1:-.08,v0:0,v1:1},
    {id:'left-far',label:'Links verder',u0:-.72,u1:-.42,v0:0,v1:1},
    {id:'right-near',label:'Rechts dichtbij',u0:1.08,u1:1.38,v0:0,v1:1},
    {id:'right-far',label:'Rechts verder',u0:1.42,u1:1.72,v0:0,v1:1},
  ];
  const project=(u:number,v:number)=>projectHomography(h,{x:u,y:v});
  const normalized=(p:Point)=>({x:p.x/width,y:p.y/height});
  const sample=(p:Point):number|null=>{
    if(p.x<0||p.y<0||p.x>=width-1||p.y>=height-1)return null;
    const x=Math.floor(p.x),y=Math.floor(p.y),fx=p.x-x,fy=p.y-y,i=y*width+x;
    return gray[i]*(1-fx)*(1-fy)+gray[i+1]*fx*(1-fy)+gray[i+width]*(1-fx)*fy+gray[i+width+1]*fx*fy;
  };
  const patches:MasonryPatch[]=specs.map(s=>{
    let polygon:Point[];
    try{polygon=[[s.u0,s.v0],[s.u1,s.v0],[s.u1,s.v1],[s.u0,s.v1]].map(([u,v])=>normalized(project(u,v)));}
    catch{return {id:s.id,label:s.label,polygon:[],joints:[],intervals:0,period:null,regularity:0,reason:'Buiten bruikbaar perspectief'};}
    const empty=(reason:string):MasonryPatch=>({id:s.id,label:s.label,polygon,joints:[],intervals:0,period:null,regularity:0,reason});
    if(polygon.some(p=>p.x<0||p.y<0||p.x>1||p.y>1))return empty('Strook valt buiten de foto');
    const rows=Math.min(1100,Math.floor(unitHeight*(s.v1-s.v0)));
    const cols=Math.min(240,Math.floor(unitWidth*(s.u1-s.u0)));
    if(rows<40||cols<24)return empty('Te weinig beeldpunten');
    // Reject sampling that magnifies a locally distant strip beyond its real detail.
    const center=(s.u0+s.u1)/2,mid=(s.v0+s.v1)/2;
    const p0=project(center,mid),p1=project(center,mid+(s.v1-s.v0)/(rows-1));
    if(Math.hypot(p1.x-p0.x,p1.y-p0.y)<.65)return empty('Te weinig lokaal detail');
    const bands=[[],[],[]] as number[][];
    for(let y=0;y<rows;y++){
      const sums=[0,0,0],counts=[0,0,0],v=s.v0+y/(rows-1)*(s.v1-s.v0);
      for(let x=0;x<cols;x++){
        const u=s.u0+x/(cols-1)*(s.u1-s.u0),value=sample(project(u,v));
        if(value===null)return empty('Strook valt buiten de foto');
        const b=Math.min(2,Math.floor(x/cols*3));sums[b]+=value;counts[b]++;
      }
      for(let b=0;b<3;b++)bands[b].push(sums[b]/counts[b]);
    }
    const detected=detectCourseProfile(bands);
    if(!detected)return empty('Geen duidelijk herhalend patroon');
    const joints=detected.joints.map(y=>{
      const v=s.v0+y/(rows-1)*(s.v1-s.v0);
      return {start:normalized(project(s.u0,v)),end:normalized(project(s.u1,v))};
    });
    return {id:s.id,label:s.label,polygon,joints,intervals:detected.intervals,period:detected.period/(rows-1)*(s.v1-s.v0),regularity:detected.regularity,reason:null};
  });
  const usable=patches.filter(p=>p.period!==null);
  let agreeingPatches=0;
  for(const a of usable){
    const count=usable.filter(b=>Math.abs(b.period!-a.period!)/a.period!<=.15).length;
    agreeingPatches=Math.max(agreeingPatches,count);
  }
  const consensus=usable.length?usable.reduce((best,a)=>{const group=usable.filter(b=>Math.abs(b.period!-a.period!)/a.period!<=.15);return group.length>best.length?group:best;},[] as MasonryPatch[]):[];
  return {coordinates:q,width,height,patches,agreeingPatches,layersOverSelection:consensus.length>=2?1/median(consensus.map(p=>p.period!)):null,status:agreeingPatches>=2?'agreement':usable.length?'limited':'unconfirmed'};
}
