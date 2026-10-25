import test from 'node:test';
import assert from 'node:assert/strict';
import {colourRolluikRgb} from '../.test-build/lib/rolluik-colour.js';
import {perspectiveWarpRgba} from '../.test-build/lib/perspective-warp.js';

test('light paint retains distinct bright surface gradients instead of a flat highlight plateau',()=>{
 const w=1264,h=1090,rgb=Buffer.alloc(w*h*3),alpha=Buffer.alloc(w*h,255),levels=[125,140,160,190];
 levels.forEach((l,i)=>{const p=((500+i)*w+700)*3;rgb.fill(l,p,p+3);});
 for(const colour of ['RAL_9010','RAL_9001']){
  const painted=colourRolluikRgb(rgb,alpha,w,h,colour),values=levels.map((_,i)=>painted[((500+i)*w+700)*3]);
  assert.ok(values.every((v,i)=>i===0||v>values[i-1]),`${colour}: ${values}`);
  assert.ok(values.every(v=>v<255&&v>220));
 }
 assert.strictEqual(colourRolluikRgb(rgb,alpha,w,h,'RAL_7016'),rgb);
});
test('RGB minification rejects false coarse patterns while keeping exact alpha, bounds and projected position',()=>{
 const w=256,h=256,rgb=Buffer.alloc(w*h*3),alpha=Buffer.alloc(w*h,255);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const p=(y*w+x)*3;rgb.fill((Math.floor(x/2)+Math.floor(y/2))%2?255:0,p,p+3);}
 const q=[{x:-3,y:2},{x:24,y:0},{x:22,y:26},{x:0,y:25}],plain=perspectiveWarpRgba(rgb,alpha,w,h,q),filtered=perspectiveWarpRgba(rgb,alpha,w,h,q,undefined,true);
 assert.equal(plain.width,filtered.width);assert.equal(plain.height,filtered.height);assert.equal(plain.offsetX,filtered.offsetX);assert.equal(plain.offsetY,filtered.offsetY);
 let e0=0,e1=0,n=0;
 for(let i=0;i<plain.width*plain.height;i++){
  assert.equal(plain.rgba[i*4+3],filtered.rgba[i*4+3]);
  if(plain.rgba[i*4+3]===255){e0+=Math.abs(plain.rgba[i*4]-127.5);e1+=Math.abs(filtered.rgba[i*4]-127.5);n++;}
 }
 assert.ok(n>300);assert.ok(e1<e0/3,`alias error ${e0/n} -> ${e1/n}`);
});
test('minification filtering cannot introduce a black fringe from transparent source pixels',()=>{
 const w=256,h=256,rgb=Buffer.alloc(w*h*3),alpha=Buffer.alloc(w*h);
 for(let y=20;y<236;y++)for(let x=20;x<236;x++){const p=y*w+x;rgb.fill(240,p*3,p*3+3);alpha[p]=255;}
 const q=[{x:0,y:0},{x:30,y:1},{x:29,y:32},{x:1,y:30}],plain=perspectiveWarpRgba(rgb,alpha,w,h,q),filtered=perspectiveWarpRgba(rgb,alpha,w,h,q,undefined,true);
 for(let i=0;i<plain.width*plain.height;i++){
  assert.equal(filtered.rgba[i*4+3],plain.rgba[i*4+3]);
  if(filtered.rgba[i*4+3]>0)assert.ok(filtered.rgba[i*4]>=239);
 }
});
test('at native scale the RGB filter preserves every original sample',()=>{
 const w=48,h=48,rgb=Buffer.alloc(w*h*3),alpha=Buffer.alloc(w*h,255);for(let i=0;i<rgb.length;i++)rgb[i]=i%255;
 const q=[{x:0,y:0},{x:47,y:0},{x:47,y:47},{x:0,y:47}];
 assert.deepEqual(perspectiveWarpRgba(rgb,alpha,w,h,q).rgba,perspectiveWarpRgba(rgb,alpha,w,h,q,undefined,true).rgba);
});
