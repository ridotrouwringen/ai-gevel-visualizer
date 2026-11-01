import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {rolluikComponentGeometry,renderRolluikComponents} from '../.test-build/lib/rolluik-components.js';
import {colourRolluikRgb} from '../.test-build/lib/rolluik-colour.js';
import {compositeGeneratedProduct} from '../.test-build/lib/image-composite.js';
const W=1300,H=1600,iw=1800,ih=1400,hints={scaleSource:'masonry-count-60mm-assumption',courseUnit:60/H,patches:[]};
function fixture(yaw,pitch,distance=3500){
 const f=1300,r1=[Math.cos(yaw),0,-Math.sin(yaw)],r2=[Math.sin(yaw)*Math.sin(pitch),Math.cos(pitch),Math.cos(yaw)*Math.sin(pitch)];
 const r3=[r1[1]*r2[2]-r1[2]*r2[1],r1[2]*r2[0]-r1[0]*r2[2],r1[0]*r2[1]-r1[1]*r2[0]];
 const P=([x,y,z])=>{const v=r1.map((r,i)=>r*x+r2[i]*y-r3[i]*z+[-600,-700,distance][i]);return {x:iw/2+f*v[0]/v[2],y:ih/2+f*v[1]/v[2]};};
 const t=[-600,-700,distance],eye={x:-r1.reduce((s,v,i)=>s+v*t[i],0),y:-r2.reduce((s,v,i)=>s+v*t[i],0)};
 return {P,eye,quad:[[0,0,0],[W,0,0],[W,H,0],[0,H,0]].map(P)};
}
const close=(a,b)=>a.forEach((p,i)=>assert.ok(Math.hypot(p.x-b[i].x,p.y-b[i].y)<1e-6));

test('both guide fronts project exactly 25mm from the wall at left/right and up/down camera angles',()=>{
 for(const yaw of [-.5,-.25,.25,.5])for(const pitch of [-.3,.3])for(const distance of [3500,5500]){
  const {P,eye,quad}=fixture(yaw,pitch,distance),original=structuredClone(quad),g=rolluikComponentGeometry(quad,'OP_DE_DAG',iw,ih,hints);
  assert.equal(g.dimensions.guideDepth,25);assert.equal(g.dimensions.guideWidth,50);assert.equal(g.cameraStatus,'assumed');assert.deepEqual(quad,original);
  for(const [name,left,right]of [['left-guide',-50,0],['right-guide',W,W+50]]){
   close(g.faces.find(f=>f.name===name).quad,[[left,0,25],[right,0,25],[right,H,25],[left,H,25]].map(P));
   const sides=g.faces.filter(f=>f.name.startsWith(name+'-side-'));assert.ok(sides.length>=1&&sides.length<=2);
   for(const side of sides){const q=side.quad;assert.ok(q.reduce((s,p,i)=>s+p.x*q[(i+1)%4].y-p.y*q[(i+1)%4].x,0)>0);
    const index=Number(side.name.at(-1));assert.ok([eye.y<0,eye.x>right,eye.y>H,eye.x<left][index]);
   }
  }
 }
});

test('guide extrusion keeps the wall anchors, curtain, bottom rail and 180mm box geometry intact',()=>{
 const {P,quad}=fixture(.4,-.25),g=rolluikComponentGeometry(quad,'OP_DE_DAG',iw,ih,hints);
 close(g.faces.find(f=>f.name==='curtain').quad,[[0,0,0],[W,0,0],[W,H-45,0],[0,H-45,0]].map(P));
 close(g.faces.find(f=>f.name==='bottom').quad,[[0,H-45,0],[W,H-45,0],[W,H,0],[0,H,0]].map(P));
 close(g.faces.find(f=>f.name==='cassette-front').quad,[[-50,-180,180],[W+50,-180,180],[W+50,0,180],[-50,0,180]].map(P));
 for(const side of g.faces.filter(f=>f.name.startsWith('left-guide-side-')||f.name.startsWith('right-guide-side-'))){
  const name=side.name.startsWith('left')?'left-guide':'right-guide',i=Number(side.name.at(-1)),left=name==='left-guide'?-50:W,right=left+50;
  const back=[[left,0,0],[right,0,0],[right,H,0],[left,H,0]],j=(i+1)%4;
  close(side.quad,[back[i],back[j],[...back[j].slice(0,2),25],[...back[i].slice(0,2),25]].map(P));
 }
});

test('IN_DE_DAG retains its original front-plane guide geometry without added side faces',()=>{
 const {P,quad}=fixture(-.4,.25),g=rolluikComponentGeometry(quad,'IN_DE_DAG',iw,ih,hints);
 close(g.faces.find(f=>f.name==='left-guide').quad,[[0,180,0],[50,180,0],[50,H,0],[0,H,0]].map(P));
 close(g.faces.find(f=>f.name==='right-guide').quad,[[W-50,180,0],[W,180,0],[W,H,0],[W-50,H,0]].map(P));
 assert.ok(!g.faces.some(f=>f.name.includes('-guide-side-')));
});

test('unavailable camera gives flat guides and an explicit fallback, never a fabricated screen offset',()=>{
 const q=[{x:100,y:100},{x:400,y:100},{x:400,y:500},{x:100,y:500}],g=rolluikComponentGeometry(q,'OP_DE_DAG',800,700,hints);
 assert.equal(g.cameraStatus,'unavailable');assert.ok(!g.faces.some(f=>f.name.includes('-guide-side-')));
 assert.ok(g.notes.some(n=>n.includes('kast en geleiders')&&n.includes('vlak')));
 assert.equal(g.faces.find(f=>f.name==='left-guide').quad[1].x,100);
});

test('extruded guide rendering has the same silhouette for all colours and preserves exterior pixels',async()=>{
 const rgba=await sharp('public/products/rolluik.png').extract({left:28,top:46,width:1264,height:1090}).ensureAlpha().raw().toBuffer(),rgb=Buffer.alloc(1264*1090*3),alpha=Buffer.alloc(1264*1090);
 for(let i=0;i<alpha.length;i++){rgb.set(rgba.subarray(i*4,i*4+3),i*3);alpha[i]=rgba[i*4+3];}
 const {quad}=fixture(.5,.3),g=rolluikComponentGeometry(quad,'OP_DE_DAG',iw,ih,hints);let expected,render;
 for(const colour of ['RAL_9005','RAL_7016','RAL_9010','RAL_9001']){
  const r=renderRolluikComponents(colourRolluikRgb(rgb,alpha,1264,1090,colour),alpha,g,iw,ih,{filterRgb:true});
  expected??=r.alpha;assert.deepEqual(r.alpha,expected);render=r;
 }
 const original=Buffer.alloc(iw*ih*3,157),photo=await sharp(original,{raw:{width:iw,height:ih,channels:3}}).png().toBuffer();
 const output=await compositeGeneratedProduct(photo,render.rgb,render.alpha,render.width,render.height,render.left,render.top),actual=await sharp(output).removeAlpha().raw().toBuffer();
 for(let y=0;y<ih;y++)for(let x=0;x<iw;x++){
  const lx=x-render.left,ly=y-render.top,covered=lx>=0&&ly>=0&&lx<render.width&&ly<render.height&&render.alpha[ly*render.width+lx]>0;
  if(!covered){const i=(y*iw+x)*3;assert.equal(actual[i],157);assert.equal(actual[i+1],157);assert.equal(actual[i+2],157);}
 }
});
