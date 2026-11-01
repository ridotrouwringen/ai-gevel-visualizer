import test from 'node:test';
import assert from 'node:assert/strict';
import {rolluikComponentGeometry} from '../.test-build/lib/rolluik-components.js';
import {projectUnitPoint} from '../.test-build/lib/perspective-warp.js';
const unknown={scaleSource:'unknown',courseUnit:null,patches:[]};
// Operator reconstruction from the reported composite, not the original clicks.
const q=[{x:990.3094720011577,y:618.6217183317058},{x:1045.1467336029746,y:635.8613814939745},{x:1044.7135500758886,y:739.5571888496634},{x:989.7951979227364,y:726.88860824937}];
const reference=[{x:0,y:-.75},{x:1,y:-.75},{x:1,y:1.75},{x:0,y:1.75}].map(p=>projectUnitPoint(q,p));
test('a larger unmeasured reference cannot inflate the box on a smaller selection',()=>{
 const own=rolluikComponentGeometry(q,'OP_DE_DAG',2048,1153,unknown);
 const result=rolluikComponentGeometry(q,'OP_DE_DAG',2048,1153,unknown,{quad:reference,hints:unknown,mountingMode:'OP_DE_DAG'});
 assert.equal(result.scaleSource,'unknown');assert.equal(result.frameHeightBasis,own.frameHeightBasis);
 assert.deepEqual(result.faces,own.faces);assert.equal(result.curtainTextureRows,own.curtainTextureRows);
});
test('real course scale may still project a physically small window with the same 180mm box',()=>{
 const hints={scaleSource:'masonry-count-60mm-assumption',courseUnit:60/3000,patches:[]};
 const result=rolluikComponentGeometry(q,'OP_DE_DAG',2048,1153,unknown,{quad:reference,hints,mountingMode:'OP_DE_DAG'});
 assert.equal(result.scaleSource,'masonry-count-60mm-assumption');assert.equal(result.referenceStatus,'shared');
 assert.ok(Math.abs(result.frameHeightBasis-1200)<1e-8);assert.equal(result.dimensions.cassetteHeight,180);assert.equal(result.dimensions.guideDepth,25);
});
