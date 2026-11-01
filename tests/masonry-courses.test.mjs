import test from 'node:test';
import assert from 'node:assert/strict';
import { detectCourseProfile, countMasonryCourses } from '../.test-build/lib/masonry-courses.js';

for(const polarity of [1,-1])test(`one mortar joint counts once, including ${polarity===1?'light':'dark'} mortar`,()=>{
  const band=Array.from({length:240},(_,i)=>100+polarity*(i%12<2?70:0));
  const r=detectCourseProfile([band,band,band]);
  assert.ok(r);assert.equal(r.period,12);assert.equal(r.joints.length,19);assert.equal(r.intervals,18);
});

test('missing joints are not invented or counted as complete observed intervals',()=>{
  const band=Array.from({length:360},(_,i)=>i%12<2&&Math.floor(i/12)!==10?180:100);
  const r=detectCourseProfile([band,band,band]);assert.ok(r);assert.equal(r.period,12);
  assert.ok(!r.joints.some(y=>y>=120&&y<122));
  assert.equal(r.intervals,r.joints.length-2);
});

test('blank walls, one edge, vertical stripes and uncorrelated noise do not yield layers',()=>{
  const blank=Array(240).fill(150),edge=blank.map((_,i)=>i<120?100:200);
  let seed=19;const random=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/2**32;};
  assert.equal(detectCourseProfile([blank,blank,blank]),null);
  assert.equal(detectCourseProfile([edge,edge,edge]),null);
  assert.equal(detectCourseProfile(Array.from({length:3},()=>Array.from({length:240},()=>random()*100))),null);
  assert.equal(detectCourseProfile([[],[],[]]),null);
});

const w=800,h=600,q=[{x:300/w,y:150/h},{x:500/w,y:150/h},{x:500/w,y:450/h},{x:300/w,y:450/h}];
function wall(){const data=new Uint8Array(w*h);for(let y=0;y<h;y++)for(let x=0;x<w;x++)data[y*w+x]=y%12<2?190:100;return data;}
test('count spans only the selected height; outside rows cannot influence it',()=>{
  const data=wall(),original=structuredClone(q),r=countMasonryCourses(data,w,h,q);
  assert.deepEqual(q,original);assert.deepEqual(r.coordinates,original);
  assert.equal(r.status,'agreement');assert.equal(r.agreeingPatches,4);
  assert.ok(Math.abs(r.layersOverSelection-25)<1);
  for(const p of r.patches)for(const line of p.joints){
    assert.ok(line.start.y>=q[0].y&&line.start.y<=q[3].y);
    assert.ok(line.end.y>=q[1].y&&line.end.y<=q[2].y);
  }
  const changed=data.slice();for(let y=0;y<h;y++)if(y<150||y>450)changed.fill(y%3?0:255,y*w,(y+1)*w);
  assert.deepEqual(countMasonryCourses(changed,w,h,q),r);
  // One blank strip must not invalidate the independent others.
  for(let y=0;y<h;y++)for(let x=224;x<=284;x++)data[y*w+x]=100;
  const partial=countMasonryCourses(data,w,h,q);assert.equal(partial.patches[0].joints.length,0);assert.ok(partial.agreeingPatches>=2);
});

test('rectification follows converging lines without changing points or physical layer repetition',()=>{
  const width=850,height=650;
  // Known projective camera map, independent analytic inverse used for rendering.
  const project=(u,v)=>({x:(300+200*u+5*v)/(1+.12*u+.04*v),y:(140+20*u+300*v)/(1+.12*u+.04*v)});
  const quad=[[0,0],[1,0],[1,1],[0,1]].map(([u,v])=>{const p=project(u,v);return {x:p.x/width,y:p.y/height};});
  const data=new Uint8Array(width*height);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const a=.12*x-200,b=.04*x-5,c=300-x,d=.12*y-20,e=.04*y-300,f=140-y;
    const determinant=a*e-b*d,v=(a*f-c*d)/determinant;
    const phase=((v/.05)%1+1)%1;
    data[y*width+x]=phase<.16?200:100;
  }
  const r=countMasonryCourses(data,width,height,quad);
  assert.equal(r.status,'agreement');assert.ok(Math.abs(r.layersOverSelection-20)<1);
  assert.deepEqual(r.coordinates,quad);
  for(const patch of r.patches)if(patch.period)assert.ok(Math.abs(patch.period-.05)<.006);
});

test('small targets and invalid geometry abstain or reject instead of producing fake detail',()=>{
  const data=new Uint8Array(w*h).fill(150);
  assert.equal(countMasonryCourses(data,w,h,q).status,'unconfirmed');
  const small=[{x:.4,y:.4},{x:.41,y:.4},{x:.41,y:.43},{x:.4,y:.43}];
  assert.equal(countMasonryCourses(data,w,h,small).layersOverSelection,null);
  assert.throws(()=>countMasonryCourses(data,w,h,[]));
  assert.throws(()=>countMasonryCourses(new Uint8Array(3),w,h,q));
});
