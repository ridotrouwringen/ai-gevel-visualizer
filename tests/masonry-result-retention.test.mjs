import test from 'node:test';
import assert from 'node:assert/strict';
import { useVisualizerStore } from '../.test-build/store/visualizer-store.js';
const store=useVisualizerStore;
const q=[{x:.2,y:.2},{x:.5,y:.2},{x:.5,y:.7},{x:.2,y:.7}];
const add=()=>{store.getState().addMask({coordinates:structuredClone(q),type:'RASTER_MASK',productType:'ROLLUIKEN',systemColor:'RAL_7016'});return store.getState().masks.at(-1).id;};
const check={key:JSON.stringify(q),status:'done',result:{coordinates:q,width:800,height:600,patches:[],status:'agreement',agreeingPatches:2,layersOverSelection:19}};

test('counts remain with each exact selection through generation, original view and colour changes',()=>{
 store.getState().setOriginalImage('photo-A');const first=add(),second=add();
 store.getState().setMasonryCheck(first,'photo-A',check);
 store.getState().setMasonryCheck(second,'photo-A',{...check,result:{...check.result,layersOverSelection:24}});
 store.getState().setGeneratedImage('result');store.getState().setGeneratedImage(null);
 assert.equal(store.getState().masonryChecks[first].result.layersOverSelection,19);
 assert.equal(store.getState().masonryChecks[second].result.layersOverSelection,24);
 store.getState().setActiveSystemColor('RAL_9005');
 assert.equal(store.getState().masonryChecks[first].result.layersOverSelection,19);
 store.getState().setGeneratedImage('result');
 store.getState().setMasonryCheck(first,'photo-A',check);
 assert.equal(store.getState().generatedImage,'result');
});

test('changed corners, removed selections and new photos cannot display an old count',()=>{
 store.getState().setOriginalImage('photo-A');const id=add();store.getState().setMasonryCheck(id,'photo-A',check);
 const moved=q.map((p,i)=>i===0?{...p,x:.21}:p);
 store.getState().updateMask(id,{coordinates:moved});assert.equal(store.getState().masonryChecks[id],undefined);
 store.getState().setMasonryCheck(id,'photo-A',check);assert.equal(store.getState().masonryChecks[id],undefined);
 store.getState().updateMask(id,{coordinates:q});store.getState().setMasonryCheck(id,'photo-A',check);
 store.getState().removeMask(id);assert.equal(store.getState().masonryChecks[id],undefined);
 store.getState().setMasonryCheck(id,'photo-A',check);assert.equal(store.getState().masonryChecks[id],undefined);
 const next=add();store.getState().setMasonryCheck(next,'photo-A',check);store.getState().setOriginalImage('photo-B');
 assert.deepEqual(store.getState().masonryChecks,{});
 const other=add();store.getState().setMasonryCheck(other,'photo-A',check);assert.deepEqual(store.getState().masonryChecks,{});
 store.getState().setMasonryCheck(other,'photo-B',check);store.getState().clearMasks();assert.deepEqual(store.getState().masonryChecks,{});
});
