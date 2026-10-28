import test from 'node:test';
import assert from 'node:assert/strict';
import { FIT_PHOTO, constrainPhotoView, zoomPhotoAt, photoPointFromClient } from '../.test-build/lib/photo-viewport.js';

const close = (a,b) => assert.ok(Math.abs(a-b)<1e-12,`${a} versus ${b}`);
test('the same original corner is selected at every zoom and pan, including fractional laptop sizes',()=>{
  const original={x:.4234,y:.3266},before=structuredClone(original);
  for(const [width,height] of [[899,599.171875],[640,426],[320,600]]) {
    for(const scale of [1,1.4,2,4,8])for(const t of [0,.3,1]) {
      const view=constrainPhotoView({scale,x:width*(1-scale)*t,y:height*(1-scale)*t},width,height);
      const rect={left:424+view.x,top:200.4+view.y,width:width*scale,height:height*scale};
      const selected=photoPointFromClient({x:rect.left+original.x*rect.width,y:rect.top+original.y*rect.height},rect);
      close(selected.x,original.x);close(selected.y,original.y);
    }
  }
  assert.deepEqual(original,before);
});
test('zoom follows the cursor and returns to exact fit without touching selections',()=>{
  const anchor={x:214,y:136};
  const zoomed=zoomPhotoAt(FIT_PHOTO,4,anchor,900,600);
  close((anchor.x-zoomed.x)/zoomed.scale,anchor.x);
  close((anchor.y-zoomed.y)/zoomed.scale,anchor.y);
  assert.deepEqual(zoomPhotoAt(zoomed,1,anchor,900,600),FIT_PHOTO);
});
test('pan and scale are bounded so the photo remains reachable',()=>{
  assert.deepEqual(constrainPhotoView({scale:1,x:999,y:-999},900,600),FIT_PHOTO);
  assert.deepEqual(constrainPhotoView({scale:2,x:-9999,y:99},900,600),{scale:2,x:-900,y:0});
  assert.equal(zoomPhotoAt(FIT_PHOTO,100,{x:450,y:300},900,600).scale,8);
  assert.equal(zoomPhotoAt(FIT_PHOTO,.1,{x:450,y:300},900,600).scale,1);
});
test('one-screen-pixel corner correction becomes proportionally finer when zoomed',()=>{
  for(const scale of [1,2,4,8]) {
    const rect={left:-300,top:-100,width:900*scale,height:600*scale};
    const a=photoPointFromClient({x:200,y:200},rect);
    const b=photoPointFromClient({x:201,y:201},rect);
    close(b.x-a.x,1/(900*scale));close(b.y-a.y,1/(600*scale));
  }
});
