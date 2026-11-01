import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {colourRolluikRgb} from '../.test-build/lib/rolluik-colour.js';
import {perspectiveWarpRgba} from '../.test-build/lib/perspective-warp.js';
test('paint variants keep source, alpha, technical parts and warped silhouette intact',async()=>{
 const {data}=await sharp('public/products/rolluik.png').extract({left:28,top:46,width:1264,height:1090}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const width=1264,height=1090,rgb=Buffer.alloc(width*height*3),alpha=Buffer.alloc(width*height);
 for(let i=0;i<alpha.length;i++){rgb.set(data.subarray(i*4,i*4+3),i*3);alpha[i]=data[i*4+3];}
 const original=Buffer.from(rgb),originalAlpha=Buffer.from(alpha);
 const quad=[{x:-10,y:15},{x:260,y:0},{x:235,y:290},{x:20,y:280}];
 const alphas=[],outputs=[];
 for(const colour of ['RAL_7016','RAL_9010','RAL_9001']){
  const out=colourRolluikRgb(rgb,alpha,width,height,colour);outputs.push(out);
  const warp=perspectiveWarpRgba(out,alpha,width,height,quad);
  alphas.push(Buffer.from(Array.from({length:warp.width*warp.height},(_,i)=>warp.rgba[i*4+3])));
  for(const [x,y] of [[100,50],[400,60],[17,83],[1246,83]]){
   const p=(y*width+x)*3;assert.deepEqual(out.subarray(p,p+3),rgb.subarray(p,p+3));
  }
 }
 assert.strictEqual(outputs[0],rgb);assert.notDeepEqual(outputs[0],outputs[1]);assert.notDeepEqual(outputs[1],outputs[2]);
 assert.deepEqual(alphas[0],alphas[1]);assert.deepEqual(alphas[0],alphas[2]);assert.deepEqual(rgb,original);assert.deepEqual(alpha,originalAlpha);
 // Every painted assembly becomes light, with cream warmer than white.
 for(const [x,y] of [[800,55],[44,400],[1210,400],[600,340],[600,1060]]){
  const p=(y*width+x)*3;assert.ok(outputs[1][p]>150);assert.ok(outputs[2][p]>outputs[2][p+2]);
 }
 // Lamella highlight and recessed shadow remain visibly different.
 const strip=[];for(let y=160;y<1030;y++)strip.push(outputs[1][(y*width+600)*3]);
 assert.ok(Math.max(...strip)-Math.min(...strip)>80);
});
