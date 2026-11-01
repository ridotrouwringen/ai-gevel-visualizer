import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {rolluikComponentGeometry,renderRolluikComponents} from '../.test-build/lib/rolluik-components.js';
import {retainRolluikReference,validateRolluikReference,inReferencePlane} from '../.test-build/lib/rolluik-reference.js';
import {colourRolluikRgb} from '../.test-build/lib/rolluik-colour.js';
const none={scaleSource:'unknown',courseUnit:null,patches:[]};
const rect=(x,y,w,h)=>[{x,y},{x:x+w,y},{x:x+w,y:y+h},{x,y:y+h}];
const referenceQuad=rect(100,100,200,300),ref={quad:referenceQuad,hints:none,mountingMode:'IN_DE_DAG'};
test('five equal shutters and one wider/taller shutter retain cassette and guide size; height adds lamellae',()=>{
 const quads=Array.from({length:5},(_,i)=>rect(100+i*240,100,200,300));quads.push(rect(1350,100,400,600));
 const results=quads.map(q=>rolluikComponentGeometry(q,'IN_DE_DAG',2000,1000,none,ref));
 for(const g of results){
  assert.equal(g.referenceStatus,'shared');assert.ok(!g.faces.some(f=>f.name==='cassette-side'));
  const box=g.faces.find(f=>f.name==='cassette-front').quad,guide=g.faces.find(f=>f.name==='left-guide').quad;
  assert.ok(Math.abs(box[3].y-box[0].y-36)<1e-8);assert.ok(Math.abs(guide[1].x-guide[0].x-10)<1e-8);
  const curtain=g.faces.find(f=>f.name==='curtain').quad;
  assert.ok(Math.abs((curtain[3].y-curtain[0].y)/g.curtainTextureRows-255/885)<.001);
 }
 assert.equal(results[0].curtainTextureRows,885);assert.ok(results[5].curtainTextureRows>results[0].curtainTextureRows*2);
});
test('the approved first IN DE DAG product retains exactly its geometry and texture rows',()=>{
 const before=rolluikComponentGeometry(referenceQuad,'IN_DE_DAG',2000,1000,none),after=rolluikComponentGeometry(referenceQuad,'IN_DE_DAG',2000,1000,none,ref);
 assert.deepEqual(after.faces,before.faces);assert.equal(after.curtainTextureRows,885);
});
test('changing colour, mounting mode, points or deleting the original selection cannot change the frozen photo reference',()=>{
 const first={coordinates:rect(.1,.1,.2,.3),mountingMode:'IN_DE_DAG'},state=retainRolluikReference(null,'photo-A',[first]);
 first.coordinates[0].x=.11;assert.equal(state.reference.coordinates[0].x,.1);
 for(const candidates of [[],[{coordinates:rect(.4,.2,.3,.6),mountingMode:'OP_DE_DAG'}]])assert.strictEqual(retainRolluikReference(state,'photo-A',candidates),state);
 const newPhoto=retainRolluikReference(state,'photo-B',[first]);assert.notStrictEqual(newPhoto,state);
});
test('reference input and separate wall planes are detected explicitly',()=>{
 for(const bad of [{},3,{coordinates:[{x:1,y:1}]}, {coordinates:rect(0,0,2,2),mountingMode:'IN_DE_DAG'}])assert.throws(()=>validateRolluikReference(bad),/gevelreferentie/);
 const input={coordinates:rect(.1,.1,.2,.3),mountingMode:'IN_DE_DAG'};assert.deepEqual(validateRolluikReference(input),input);
 assert.equal(inReferencePlane(referenceQuad,[{x:500,y:100},{x:800,y:200},{x:800,y:500},{x:500,y:400}]),null);
});
test('all four colours use identical product geometry and alpha, also for the larger shutter',async()=>{
 const data=await sharp('public/products/rolluik.png').extract({left:28,top:46,width:1264,height:1090}).ensureAlpha().raw().toBuffer(),rgb=Buffer.alloc(1264*1090*3),alpha=Buffer.alloc(1264*1090);
 for(let i=0;i<alpha.length;i++){rgb.set(data.subarray(i*4,i*4+3),i*3);alpha[i]=data[i*4+3];}
 const geometry=rolluikComponentGeometry(rect(400,100,300,600),'IN_DE_DAG',1000,1000,none,ref);let expected;
 for(const colour of ['RAL_7016','RAL_9005','RAL_9010','RAL_9001']){
  const r=renderRolluikComponents(colourRolluikRgb(rgb,alpha,1264,1090,colour),alpha,geometry,1000,1000,{filterRgb:true});
  expected??=r.alpha;assert.deepEqual(r.alpha,expected);
 }
});
