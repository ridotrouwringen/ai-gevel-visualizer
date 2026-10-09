import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {rolluikProductFootprint,ROLLUIK_ASSET} from '../.test-build/lib/rolluik-placement.js';
import {projectUnitPoint} from '../.test-build/lib/perspective-warp.js';
import {cachedForeground} from '../.test-build/lib/foreground-cache.js';
import {useVisualizerStore} from '../.test-build/store/visualizer-store.js';
const quads=[[[100,100],[300,100],[300,300],[100,300]],[[100,150],[350,90],[310,310],[110,400]]].map(q=>q.map(([x,y])=>({x,y})));
for (const [i,q] of quads.entries()) test(`mount anchors and immutable frame, quad ${i}`,()=>{
 const before=structuredClone(q),a=ROLLUIK_ASSET,p=rolluikProductFootprint(q,'OP_DE_DAG');
 [[a.left,a.top],[a.right,a.top],[a.right,a.bottom],[a.left,a.bottom]].forEach(([x,y],index)=>{
  const r=projectUnitPoint(p,{x:x/(a.width-1),y:y/(a.height-1)});
  assert.ok(Math.hypot(r.x-q[index].x,r.y-q[index].y)<1e-6);
 });
 assert.deepEqual(q,before);assert.deepEqual(rolluikProductFootprint(q,'IN_DE_DAG'),q);
 assert.ok(p[0].y<q[0].y);assert.ok(p[0].x<q[0].x);
});
test('invalid and degenerate quads are rejected',()=>{
 assert.throws(()=>rolluikProductFootprint([{x:0,y:0},{x:1,y:0},{x:1,y:0},{x:0,y:1}]));
 assert.throws(()=>rolluikProductFootprint(quads[0],'UNKNOWN'));
});
test('approved source asset bytes stay unchanged',()=>{
 const bytes=fs.readFileSync(new URL('../public/products/rolluik.png',import.meta.url));
 assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),'a8477b4c8d48616f8c2c9687042041789074c5ba2a777a38adeccc37976c49f4');
});
test('selected mounting/colour and points can change without modifying original photo',()=>{
 const store=useVisualizerStore;store.getState().setOriginalImage('original');
 store.getState().addMask({productType:'ROLLUIKEN',systemColor:'RAL_7016',type:'RASTER_MASK',coordinates:quads[0],mountingMode:'OP_DE_DAG'});
 const id=store.getState().masks[0].id;
 store.getState().setActiveMountingMode('IN_DE_DAG');assert.equal(store.getState().masks[0].mountingMode,'IN_DE_DAG');
 store.getState().setActiveSystemColor('RAL_9010');assert.equal(store.getState().masks[0].systemColor,'RAL_9010');
 store.getState().updateMask(id,{coordinates:quads[1]});assert.deepEqual(store.getState().masks[0].coordinates,quads[1]);
 assert.equal(store.getState().originalImage,'original');store.getState().clearMasks();
});
test('scene analysis reused including simultaneous requests, errors retry',async()=>{
 let calls=0;const load=async()=>{calls++;return Buffer.from([255]);};
 const [a,b]=await Promise.all([cachedForeground('photo-test-A',load),cachedForeground('photo-test-A',load)]);
 assert.equal(calls,1);assert.deepEqual(a,b);
 await assert.rejects(cachedForeground('photo-test-error',async()=>{throw Error('retry');}));
 assert.deepEqual(await cachedForeground('photo-test-error',load),Buffer.from([255]));
});
test('multiple selections keep independent settings, points and original on change/delete/regenerate',()=>{
 const store=useVisualizerStore;store.getState().setOriginalImage('pristine');
 for(let i=0;i<3;i++)store.getState().addMask({productType:'ROLLUIKEN',systemColor:['RAL_7016','RAL_9010','RAL_9001'][i],type:'RASTER_MASK',coordinates:quads[i%2],mountingMode:i%2?'IN_DE_DAG':'OP_DE_DAG'});
 const before=structuredClone(store.getState().masks),ids=before.map(m=>m.id);
 store.getState().selectMask(ids[0]);store.getState().setActiveSystemColor('RAL_9010');store.getState().setActiveMountingMode('IN_DE_DAG');store.getState().updateMask(ids[0],{coordinates:quads[1]});
 assert.deepEqual(store.getState().masks.slice(1),before.slice(1));
 store.getState().setGeneratedImage('render');store.getState().removeMask(ids[0]);
 assert.deepEqual(store.getState().masks,before.slice(1));assert.equal(store.getState().generatedImage,null);
 store.getState().setGeneratedImage('render2');assert.equal(store.getState().originalImage,'pristine');
 store.getState().clearMasks();
});
