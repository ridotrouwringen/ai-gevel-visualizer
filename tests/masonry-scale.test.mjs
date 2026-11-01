import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { masonryScaleHints,TEST_COURSE_HEIGHT_MM,SLAT_HEIGHT_MM } from '../.test-build/lib/masonry-scale.js';
import { facadeCourseAnalysis } from '../.test-build/lib/masonry-analysis.js';
import { rolluikComponentGeometry,renderRolluikComponents } from '../.test-build/lib/rolluik-components.js';
import { colourRolluikRgb } from '../.test-build/lib/rolluik-colour.js';
const quad=[{x:200,y:180},{x:500,y:180},{x:500,y:684},{x:200,y:684}];
const counted=(layers)=>({coordinates:[],width:800,height:900,patches:[],status:'agreement',agreeingPatches:2,layersOverSelection:layers});
const none={scaleSource:'unknown',courseUnit:null,patches:[]};

test('42 courses set a 2520mm basis: box is 3 courses and slats are 3/4 course in both mountings',()=>{
 assert.equal(TEST_COURSE_HEIGHT_MM,60);assert.equal(SLAT_HEIGHT_MM,45);
 const hints=masonryScaleHints(counted(42)),original=structuredClone(quad);
 for(const mode of ['OP_DE_DAG','IN_DE_DAG']){
  const g=rolluikComponentGeometry(quad,mode,800,900,hints);
  assert.equal(g.frameHeightBasis,2520);assert.deepEqual(quad,original);
  assert.equal(g.dimensions.cassetteHeight,180);assert.equal(g.dimensions.cassetteDepth,180);assert.equal(g.dimensions.slatHeight,45);
  const box=g.faces.find(f=>f.name==='cassette-front').quad;
  assert.ok(Math.abs((box[3].y-box[0].y)/(quad[3].y-quad[0].y)-3/42)<1e-10);
  const body=2520-45-(mode==='IN_DE_DAG'?180:0);
  assert.ok(Math.abs(g.curtainTextureRows-body/45*(623/15))<=.5);
  assert.equal(g.scaleSource,'masonry-count-60mm-assumption');
 }
});

test('no scale is accepted from absent, conflicting or non-finite counts',()=>{
 for(const input of [{...counted(42),status:'limited'},{...counted(42),agreeingPatches:1},counted(null),counted(NaN),counted(Infinity),counted(0)])assert.deepEqual(masonryScaleHints(input),none);
 const g=rolluikComponentGeometry(quad,'IN_DE_DAG',800,900,none);
 assert.equal(g.scaleSource,'unknown');assert.equal(g.curtainTextureRows,885);
});

test('an uncounted reference cannot overwrite a counted selection; a counted plane retains equal product sizes',()=>{
 const hints=masonryScaleHints(counted(42));
 const direct=rolluikComponentGeometry(quad,'IN_DE_DAG',800,900,hints,{quad,hints:none,mountingMode:'IN_DE_DAG'});
 assert.equal(direct.frameHeightBasis,2520);assert.equal(direct.scaleSource,'masonry-count-60mm-assumption');
 const tall=quad.map((p,i)=>i>=2?{...p,y:p.y+252}:p);
 const g=rolluikComponentGeometry(tall,'IN_DE_DAG',800,1200,none,{quad,hints,mountingMode:'IN_DE_DAG'});
 assert.ok(Math.abs(g.frameHeightBasis-3780)<1e-9);assert.equal(g.referenceStatus,'shared');
 const box=g.faces.find(f=>f.name==='cassette-front').quad;
 assert.ok(Math.abs(box[3].y-box[0].y-36)<1e-8);
 assert.ok(Math.abs(g.curtainTextureRows-(3780-225)/45*(623/15))<=.5);
});

test('the shared real-photo analysis deduplicates calls and produces exactly the count used for scale',async()=>{
 const width=800,height=600,data=Buffer.alloc(width*height);for(let y=0;y<height;y++)data.fill(y%12<2?200:100,y*width,(y+1)*width);
 const photo=await sharp(data,{raw:{width,height,channels:1}}).png().toBuffer();
 const q=[{x:.375,y:.25},{x:.625,y:.25},{x:.625,y:.75},{x:.375,y:.75}];
 const [a,b]=await Promise.all([facadeCourseAnalysis(photo,q),facadeCourseAnalysis(photo,q)]);
 assert.strictEqual(a,b);assert.equal(a.status,'agreement');
 const hints=masonryScaleHints(a),pixels=q.map(p=>({x:p.x*width,y:p.y*height}));
 const g=rolluikComponentGeometry(pixels,'IN_DE_DAG',width,height,hints);
 assert.ok(Math.abs(g.frameHeightBasis-a.layersOverSelection*60)<1e-9);
 const blank=await sharp({create:{width,height,channels:3,background:'#999999'}}).png().toBuffer();
 assert.deepEqual(masonryScaleHints(await facadeCourseAnalysis(blank,q)),none);
});

test('all four colours retain the counted box, guide and 45mm lamella geometry and exact alpha',async()=>{
 const rgba=await sharp('public/products/rolluik.png').extract({left:28,top:46,width:1264,height:1090}).ensureAlpha().raw().toBuffer();
 const rgb=Buffer.alloc(1264*1090*3),alpha=Buffer.alloc(1264*1090);
 for(let i=0;i<alpha.length;i++){rgb.set(rgba.subarray(i*4,i*4+3),i*3);alpha[i]=rgba[i*4+3];}
 const g=rolluikComponentGeometry(quad,'IN_DE_DAG',800,900,masonryScaleHints(counted(42)));let expected;
 for(const colour of ['RAL_9005','RAL_7016','RAL_9010','RAL_9001']){
  const r=renderRolluikComponents(colourRolluikRgb(rgb,alpha,1264,1090,colour),alpha,g,800,900,{filterRgb:true});
  if(!expected)expected=r;else{assert.deepEqual(r.alpha,expected.alpha);assert.equal(r.width,expected.width);assert.equal(r.height,expected.height);}
 }
});
