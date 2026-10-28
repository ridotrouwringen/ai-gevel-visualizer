import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { projectHomography, unitQuadHomography, type PerspectivePoint } from './perspective-warp';

export type MetricHints = {
  scaleSource: 'repetition-60mm-assumption' | 'masonry-count-60mm-assumption' | 'unknown';
  courseUnit: number | null;
  patches: {name:string; period:number; score:number; method:number}[];
};
const photoCache = new Map<string,{at:number; gray:Promise<{data:Buffer;width:number;height:number}>; hints:Map<string,MetricHints>}>();

function period(values: number[]) {
  const n=values.length,mean=values.reduce((a,b)=>a+b,0)/n,center=(n-1)/2;
  let num=0,den=0;
  values.forEach((v,i)=>{num+=(i-center)*(v-mean);den+=(i-center)**2;});
  const slope=num/den,p=values.map((v,i)=>v-mean-slope*(i-center));
  const energy=p.reduce((a,b)=>a+b*b,0);
  if(energy<1e-8)return null;
  const ac:number[]=[];
  for(let lag=0;lag<=64;lag++){let sum=0;for(let i=0;i<n-lag;i++)sum+=p[i]*p[i+lag];ac[lag]=sum/energy;}
  let score=-Infinity,best=0;
  for(let lag=5;lag<64;lag++)if(ac[lag]>ac[lag-1]&&ac[lag]>ac[lag+1]&&ac[lag]>score){best=lag;score=ac[lag];}
  if(!best||score<0.30||n/best<5)return null;
  return {period:best/256,score};
}

/** A periodic texture is NOT proof of masonry, a 60mm course or metric scale.
 * This is always exposed as an assumption, never as validated measurements.
 */
export function analyseFacadeRepetition(data:Uint8Array,width:number,height:number,quad:PerspectivePoint[]):MetricHints {
  const h=unitQuadHomography(quad),patches:MetricHints['patches']=[];
  const boxes:[string,number,number,number,number][]=[['left',-.6,-.1,0,1],['right',1.1,1.6,0,1],['above',0,1,-.6,-.1],['below',0,1,1.1,1.6]];
  for(const [name,x0,x1,y0,y1]of boxes){
    const nx=Math.round((x1-x0)*256),ny=Math.round((y1-y0)*256),profile:number[]=[],gradient:number[]=[];
    let valid=0;const matrix:number[][]=[];
    for(let y=0;y<ny;y++){
      const row:number[]=[];
      for(let x=0;x<nx;x++){
        let px:PerspectivePoint;try{px=projectHomography(h,{x:x0+(x1-x0)*x/(nx-1),y:y0+(y1-y0)*y/(ny-1)});}catch{row.push(0);continue;}
        const ix=Math.floor(px.x),iy=Math.floor(px.y),dx=px.x-ix,dy=px.y-iy;
        if(ix<0||iy<0||ix>=width-1||iy>=height-1){row.push(0);continue;}
        valid++;
        row.push((data[iy*width+ix]*(1-dx)+data[iy*width+ix+1]*dx)*(1-dy)+(data[(iy+1)*width+ix]*(1-dx)+data[(iy+1)*width+ix+1]*dx)*dy);
      }
      matrix.push(row);profile.push(row.reduce((a,b)=>a+b,0)/nx);
    }
    if(valid/(nx*ny)<.95)continue;
    for(let y=0;y<ny;y++){
      const a=matrix[Math.max(0,y-1)],b=matrix[Math.min(ny-1,y+1)],div=y===0||y===ny-1?1:2;
      gradient.push(a.reduce((sum,v,x)=>sum+Math.abs(b[x]-v)/div,0)/nx);
    }
    [profile,gradient].forEach((values,method)=>{
      const found=period(values);if(!found)return;
      try {
        const mid={x:(x0+x1)/2,y:(y0+y1)/2},a=projectHomography(h,mid),b=projectHomography(h,{...mid,y:mid.y+found.period});
        if(Math.hypot(a.x-b.x,a.y-b.y)<3)return;
        patches.push({name,...found,method});
      } catch { /* A patch crossing the horizon is not a usable scale cue. */ }
    });
  }
  const candidates=patches.map(p=>{
    const group=patches.filter(q=>Math.abs(q.period/p.period-1)<=.1);
    const intensity=new Set(group.filter(q=>q.method===0).map(q=>q.name)).size;
    const gradient=new Set(group.filter(q=>q.method===1).map(q=>q.name)).size;
    return {group,accepted:intensity>=2&&gradient>=2,score:intensity+gradient};
  }).filter(p=>p.accepted).sort((a,b)=>b.score-a.score);
  if(!candidates.length)return {scaleSource:'unknown',courseUnit:null,patches};
  const primary=candidates[0].group.map(p=>p.period).sort((a,b)=>a-b);
  const value=primary[Math.floor(primary.length/2)];
  // Reject competing strong periods, rather than average half/double aliases.
  if(candidates.some(c=>Math.abs(c.group[0].period/value-1)>.15))return {scaleSource:'unknown',courseUnit:null,patches};
  return {scaleSource:'repetition-60mm-assumption',courseUnit:value,patches};
}

/** Cache by exact photo and quad; paint and mounting changes do not rerun it. */
export async function facadeMetricHints(photo:Buffer,quad:PerspectivePoint[]):Promise<MetricHints>{
  const hash=createHash('sha256').update(photo).digest('hex'),now=Date.now();
  for(const [key,item]of photoCache)if(now-item.at>600_000)photoCache.delete(key);
  let item=photoCache.get(hash);
  if(!item){
    if(photoCache.size>=2)photoCache.delete(photoCache.keys().next().value!);
    const gray=sharp(photo).removeAlpha().greyscale().raw().toBuffer({resolveWithObject:true}).then(x=>({data:x.data,width:x.info.width,height:x.info.height}));
    item={at:now,gray,hints:new Map()};photoCache.set(hash,item);
    gray.catch(()=>{if(photoCache.get(hash)===item)photoCache.delete(hash);});
  }
  const key=JSON.stringify(quad),cached=item.hints.get(key);if(cached)return cached;
  const gray=await item.gray,result=analyseFacadeRepetition(gray.data,gray.width,gray.height,quad);
  if(item.hints.size>=32)item.hints.delete(item.hints.keys().next().value!);
  item.hints.set(key,result);return result;
}
