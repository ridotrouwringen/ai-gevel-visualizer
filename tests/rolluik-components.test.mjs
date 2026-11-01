import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {rolluikComponentGeometry,renderRolluikComponents} from '../.test-build/lib/rolluik-components.js';
import {analyseFacadeRepetition} from '../.test-build/lib/facade-metric-hints.js';
import {colourRolluikRgb} from '../.test-build/lib/rolluik-colour.js';
import {compositeGeneratedProduct} from '../.test-build/lib/image-composite.js';
const hints={scaleSource:'repetition-60mm-assumption',courseUnit:.04,patches:[]};
const unknown={scaleSource:'unknown',courseUnit:null,patches:[]};
const quad=[{x:100,y:120},{x:400,y:120},{x:400,y:420},{x:100,y:420}];
test('physical component heights/widths follow the declared scale, not stretched frame proportions',()=>{
 for(const W of [700,1200,2500])for(const H of [900,1500,2800]){
  const q=[{x:100,y:100},{x:100+W/5,y:100},{x:100+W/5,y:100+H/5},{x:100,y:100+H/5}];
  const g=rolluikComponentGeometry(q,'OP_DE_DAG',1200,1000,{...hints,courseUnit:60/H});
  const cast=g.faces.find(f=>f.name==='cassette-front').quad,guide=g.faces.find(f=>f.name==='left-guide').quad;
  assert.ok(Math.abs(cast[3].y-cast[0].y-36)<1e-7);assert.ok(Math.abs(guide[1].x-guide[0].x-10)<1e-7);
  assert.equal(g.cameraStatus,'unavailable');assert.equal(g.metricStatus,'indicative');
 }
});
test('synthetic calibrated camera recovers 180mm outward projection, with original frame plane preserved',()=>{
 let count=0;
 for(const yaw of [-.5,-.25,.25,.5])for(const pitch of [-.3,.3])for(const distance of [3500,5500]){
  const f=1300,iw=1800,ih=1400,W=1300,H=1600;
  const r1=[Math.cos(yaw),0,-Math.sin(yaw)],r2=[Math.sin(yaw)*Math.sin(pitch),Math.cos(pitch),Math.cos(yaw)*Math.sin(pitch)];
  const r3=[r1[1]*r2[2]-r1[2]*r2[1],r1[2]*r2[0]-r1[0]*r2[2],r1[0]*r2[1]-r1[1]*r2[0]];
  const P=([x,y,z])=>{const v=r1.map((r,i)=>r*x+r2[i]*y-r3[i]*z+[-600,-700,distance][i]);return {x:iw/2+f*v[0]/v[2],y:ih/2+f*v[1]/v[2]};};
  const q=[[0,0,0],[W,0,0],[W,H,0],[0,H,0]].map(P),g=rolluikComponentGeometry(q,'OP_DE_DAG',iw,ih,{...hints,courseUnit:60/H});
  assert.equal(g.cameraStatus,'assumed');assert.ok(Math.abs(g.frameWidthBasis-W)<1e-6);
  const expected=[[-50,-180,180],[W+50,-180,180],[W+50,0,180],[-50,0,180]].map(P);
  g.faces.find(f=>f.name==='cassette-front').quad.forEach((p,i)=>assert.ok(Math.hypot(p.x-expected[i].x,p.y-expected[i].y)<1e-6));count++;
 }
 assert.equal(count,16);
});
test('IN DE DAG remains entirely within the frame and never assumes recess depth',()=>{
 const g=rolluikComponentGeometry(quad,'IN_DE_DAG',600,600,hints);
 for(const p of g.faces.flatMap(f=>f.quad)){assert.ok(p.x>=100-1e-8&&p.x<=400+1e-8&&p.y>=120-1e-8&&p.y<=420+1e-8);}
 assert.ok(!g.faces.some(f=>f.name==='cassette-side'));
});
test('unknown scale has an explicit non-measurement status and flat frontal camera fallback',()=>{
 const g=rolluikComponentGeometry(quad,'OP_DE_DAG',600,600,unknown);
 assert.equal(g.scaleSource,'unknown');assert.equal(g.cameraStatus,'unavailable');assert.ok(g.notes.some(s=>s.includes('Geen bruikbare schaalreferentie')));assert.ok(g.notes.some(s=>s.includes('vlak')));
});
test('blank facade cannot acquire a scale; fixed repeated texture is labelled assumption only',()=>{
 const q=[{x:200,y:200},{x:400,y:200},{x:400,y:500},{x:200,y:500}];
 assert.equal(analyseFacadeRepetition(Buffer.alloc(800*800,120),800,800,q).scaleSource,'unknown');
 const gray=Buffer.alloc(800*800);for(let y=0;y<800;y++)for(let x=0;x<800;x++)gray[y*800+x]=y%12<2?60:170;
 const h=analyseFacadeRepetition(gray,800,800,q);
 assert.equal(h.scaleSource,'repetition-60mm-assumption');assert.ok(Math.abs(h.courseUnit-.04)<.005);
});
let source;
async function asset(){
 if(source)return source;
 const {data}=await sharp('public/products/rolluik.png').extract({left:28,top:46,width:1264,height:1090}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const rgb=Buffer.alloc(1264*1090*3),alpha=Buffer.from(Array.from({length:1264*1090},(_,i)=>data[i*4+3]));
 for(let i=0;i<alpha.length;i++)rgb.set(data.subarray(i*4,i*4+3),i*3);
 return source={rgb,alpha};
}
test('all colours retain identical component geometry/alpha, with different painted RGB',async()=>{
 const {rgb,alpha}=await asset(),g=rolluikComponentGeometry(quad,'OP_DE_DAG',600,600,hints),results=[];
 for(const colour of ['RAL_7016','RAL_9010','RAL_9001'])results.push(renderRolluikComponents(colourRolluikRgb(rgb,alpha,1264,1090,colour),alpha,g,600,600));
 for(const r of results.slice(1)){assert.deepEqual(r.alpha,results[0].alpha);assert.notDeepEqual(r.rgb,results[0].rgb);assert.equal(r.left,results[0].left);}
 assert.notDeepEqual(results[1].rgb,results[2].rgb);
});
test('component edges clip on all photo edges/corners and preserve every pixel outside coverage',async()=>{
 const {rgb,alpha}=await asset();
 for(const [dx,dy] of [[-180,0],[350,0],[0,-150],[0,350],[-180,-150],[350,-150],[-180,350],[350,350]]){
  const q=quad.map(p=>({x:p.x+dx,y:p.y+dy})),g=rolluikComponentGeometry(q,'OP_DE_DAG',600,600,hints),r=renderRolluikComponents(rgb,alpha,g,600,600);
  const original=Buffer.alloc(600*600*3,157),photo=await sharp(original,{raw:{width:600,height:600,channels:3}}).png().toBuffer();
  const output=await compositeGeneratedProduct(photo,r.rgb,r.alpha,r.width,r.height,r.left,r.top),actual=await sharp(output).removeAlpha().raw().toBuffer();
  let changed=0;for(let y=0;y<600;y++)for(let x=0;x<600;x++){
   const lx=x-r.left,ly=y-r.top,inside=lx>=0&&ly>=0&&lx<r.width&&ly<r.height&&r.alpha[ly*r.width+lx]>0,i=(y*600+x)*3;
   if(!inside)assert.deepEqual(actual.subarray(i,i+3),original.subarray(i,i+3));else if(actual[i]!==157)changed++;
  }
  assert.ok(changed>0);
 }
});
