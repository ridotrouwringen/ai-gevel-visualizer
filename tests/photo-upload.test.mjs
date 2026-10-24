import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {fitFacadePhoto,MAX_FACADE_DATA_URL_BYTES,MAX_FACADE_EDGE} from '../.test-build/lib/photo-upload.js';
import {serializeGenerationRequest} from '../.test-build/lib/generation-http.js';
const jpeg='data:image/jpeg;base64,';

test('upload preserves aspect ratio, never upscales, and fits portrait/landscape into the photo limit',async()=>{
 for(const [width,height] of [[6000,4000],[3000,6000],[800,600],[1,6000]]){
  const sizes=[];const result=await fitFacadePhoto(width,height,async(w,h,q)=>{sizes.push([w,h,q]);return jpeg+'A'.repeat(100);});
  assert.ok(Math.max(result.width,result.height)<=MAX_FACADE_EDGE);
  assert.ok(result.width<=width&&result.height<=height);
  assert.ok(Math.abs(result.width-width*Math.min(1,MAX_FACADE_EDGE/Math.max(width,height)))<=1);
  assert.ok(Math.abs(result.height-height*Math.min(1,MAX_FACADE_EDGE/Math.max(width,height)))<=1);
  assert.equal(sizes.length,1);
 }
});
test('compression tries high quality at the same dimensions before reducing resolution',async()=>{
 const attempts=[];
 const result=await fitFacadePhoto(5000,4000,async(w,h,q)=>{attempts.push([w,h,q]);return jpeg+'A'.repeat(q>.8?MAX_FACADE_DATA_URL_BYTES:50);});
 assert.deepEqual(attempts.map(a=>a[2]),[.92,.86,.8]);assert.equal(result.width,3200);assert.equal(result.height,2560);
});
test('difficult images get bounded resolution fallback; pathological encoders fail visibly',async()=>{
 const attempts=[];
 const result=await fitFacadePhoto(6000,4000,async(w,h,q)=>{attempts.push([w,h,q]);return jpeg+'A'.repeat(w>2800?MAX_FACADE_DATA_URL_BYTES:100);});
 assert.equal(result.width,2720);assert.ok(result.dataUrl.length<=MAX_FACADE_DATA_URL_BYTES);
 let calls=0;await assert.rejects(fitFacadePhoto(2000,1500,async()=>{calls++;return jpeg+'A'.repeat(MAX_FACADE_DATA_URL_BYTES);}),/andere JPEG/);
 assert.ok(calls<30);
 await assert.rejects(fitFacadePhoto(100,100,async()=> 'data:image/png;base64,AA'),/JPEG-werkfoto/);
});
test('invalid dimensions reject before any codec call',async()=>{
 for(const [w,h]of [[0,1],[-1,10],[NaN,4],[10,Infinity],[1.5,4]])await assert.rejects(fitFacadePhoto(w,h,async()=>{throw Error('codec must not run');}),/afmetingen/);
});
test('a real large JPEG exceeds the old request limit but the prepared photo fits with eight masks and three references',async()=>{
 const width=4000,height=3000,pixels=Buffer.alloc(width*height*3);let seed=13579;
 for(let i=0;i<pixels.length;i++){seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;pixels[i]=seed&255;}
 const original=await sharp(pixels,{raw:{width,height,channels:3}}).jpeg({quality:98}).toBuffer();
 assert.ok(original.length>3_000_000);
 assert.throws(()=>serializeGenerationRequest({image:jpeg+original.toString('base64')}),/te groot/);
 const result=await fitFacadePhoto(width,height,async(w,h,q)=>jpeg+(await sharp(original).resize(w,h).jpeg({quality:Math.round(q*100)}).toBuffer()).toString('base64'));
 const meta=await sharp(Buffer.from(result.dataUrl.split(',')[1],'base64')).metadata();
 assert.equal(meta.width,result.width);assert.equal(meta.height,result.height);
 const selections=Array.from({length:8},(_,i)=>({id:String(i),coordinates:[{x:.1,y:.2},{x:.3,y:.2},{x:.3,y:.6},{x:.1,y:.6}],rasterMasks:[{width:500,height:400,offsetX:10,offsetY:20,dataRle:Array.from({length:400},()=>[0,100,255,300,0,100]).flat()}]}));
 const body=serializeGenerationRequest({image:result.dataUrl,selections,productReferenceImages:Array(3).fill(jpeg+'A'.repeat(699900))});
 assert.ok(Buffer.byteLength(body)<4_400_000);
 console.log(JSON.stringify({fixture:'seeded noise JPEG',originalBytes:original.length,workBytes:Math.ceil((result.dataUrl.length-jpeg.length)*3/4),width:result.width,height:result.height,requestBytes:Buffer.byteLength(body)}));
});
