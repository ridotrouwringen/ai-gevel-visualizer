import test from 'node:test';
import assert from 'node:assert/strict';
import {packRasterMask,unpackRasterMask} from '../.test-build/lib/raster-mask-transfer.js';
import {buildRasterMask} from '../.test-build/lib/masks.js';
import {readGenerationResponse,serializeGenerationRequest} from '../.test-build/lib/generation-http.js';
const mask=data=>({data,width:data.length,height:1,offsetX:-1,offsetY:2});
test('mask transport preserves every value, shape, offset and clipped composite mask',()=>{
 for(const values of [Array(50).fill(255),Array(50).fill(0),[0,0,1,1,127,127,255,255,0,0],[0,255,0,255],Array.from({length:100},(_,i)=>i%15<7?255:0)]){
  const original=mask(values),before=structuredClone(original),packed=JSON.parse(JSON.stringify(packRasterMask(original))),decoded=unpackRasterMask(packed,1000);
  assert.deepEqual(decoded,original);assert.deepEqual(original,before);
  assert.deepEqual(buildRasterMask(110,4,[decoded]),buildRasterMask(110,4,[original]));
 }
});
test('legacy clients and highly fragmented masks remain supported',()=>{
 const a=mask([0,255,0,255]);assert.strictEqual(packRasterMask(a),a);assert.strictEqual(unpackRasterMask(a,100),a);
});
test('oversized, truncated or invalid compressed masks rejected before decoding',()=>{
 const a={width:3,height:1,offsetX:0,offsetY:0};
 for(const dataRle of [[],[255],[255,2],[255,4],[255,-1],[255,0],[256,3],[255,1.5],[0,2,255,2]])assert.throws(()=>unpackRasterMask({...a,dataRle},100));
 assert.throws(()=>unpackRasterMask({...a,width:1e12,dataRle:[255,1e12]},100));
});
test('a realistic large selection crosses the old limit but is tiny losslessly packed',()=>{
 const original={data:Array(1500*1200).fill(255),width:1500,height:1200,offsetX:10,offsetY:10};
 const photo='data:image/jpeg;base64,'+'A'.repeat(600000);
 const old={image:photo,selections:[{rasterMasks:[original]}]},packed={image:photo,selections:[{rasterMasks:[packRasterMask(original)]}]};
 assert.ok(Buffer.byteLength(JSON.stringify(old))>4500000);assert.throws(()=>serializeGenerationRequest(old),/te groot/);
 assert.ok(Buffer.byteLength(serializeGenerationRequest(packed))<601000);
 assert.deepEqual(unpackRasterMask(packed.selections[0].rasterMasks[0],2000000),original);
});
test('an oversized original photo is caught with an actionable message, without resampling',()=>{
 assert.throws(()=>serializeGenerationRequest({image:'é'.repeat(2300000)}),/kleinere bestandsgrootte/);
});
test('413 plain text has an actionable message rather than a JSON parse error',async()=>{
 await assert.rejects(readGenerationResponse(new Response('Request Entity Too Large',{status:413})),/foto en selecties.*te groot/);
});
test('non-JSON gateway errors and malformed success responses remain readable',async()=>{
 await assert.rejects(readGenerationResponse(new Response('<html>Bad Gateway</html>',{status:502})),/HTTP 502/);
 await assert.rejects(readGenerationResponse(new Response('not json',{status:200})),/HTTP 200/);
 await assert.rejects(readGenerationResponse(Response.json({success:true})),/Geen afbeelding/);
});
test('valid success and structured API errors keep existing behavior',async()=>{
 assert.deepEqual(await readGenerationResponse(Response.json({imageUrl:'data:image/png;base64,AAAA'})),{imageUrl:'data:image/png;base64,AAAA'});
 await assert.rejects(readGenerationResponse(Response.json({error:'Selectie is ongeldig'},{status:400})),/Selectie is ongeldig/);
});
test('generation response carries the server course count back to the result summary',async()=>{
 const masonry={coordinates:[{x:.2,y:.2},{x:.4,y:.2},{x:.4,y:.6},{x:.2,y:.6}],patches:[],status:'agreement',agreeingPatches:2,layersOverSelection:42,width:800,height:600};
 const r=await readGenerationResponse(Response.json({imageUrl:'data:image/png;base64,AAAA',results:[{id:'frame',masonry},{id:7,masonry},null]}));
 assert.deepEqual(r.results,[{id:'frame',masonry}]);
});
