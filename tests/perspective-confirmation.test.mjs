import test from 'node:test';
import assert from 'node:assert/strict';
import { detectFacadeLines, confirmSelectionPerspective, validatePerspectiveCoordinates } from '../.test-build/lib/perspective-confirmation.js';

const width=800,height=600;
const project=(u,v)=>{const d=1+.18*u+.05*v;return {x:(100+240*u+10*v)/d,y:(90+20*u+160*v)/d};};
const normalized=p=>({x:p.x/width,y:p.y/height});
const quad=[[0,0],[1,0],[1,1],[0,1]].map(([u,v])=>normalized(project(u,v)));
const seg=(a,b)=>({start:a,end:b,strength:1});

test('user edges stay authoritative while independent projective lines confirm both directions',()=>{
  const original=structuredClone(quad);
  const segments=[...[-.25,.25,.5,1.3,1.7,2].map(v=>seg(project(-.2,v),project(1.7,v))),...[.2,.45,.7,1.2,1.5,2].map(u=>seg(project(u,-.2),project(u,1.5)))];
  const result=confirmSelectionPerspective(segments,quad,width,height);
  assert.equal(result.horizontal.status,'supported');assert.equal(result.vertical.status,'supported');
  assert.equal(result.horizontal.lines.length,5);assert.equal(result.vertical.lines.length,5);
  assert.deepEqual(result.coordinates,original);assert.deepEqual(quad,original);
  assert.ok([...result.horizontal.lines,...result.vertical.lines].every(s=>s.errorDegrees<1e-4));
});

test('long conflicting facade lines cannot rotate the selection or masquerade as support',()=>{
  const q=[{x:.2,y:.2},{x:.6,y:.2},{x:.6,y:.6},{x:.2,y:.6}];
  const segments=Array.from({length:20},(_,i)=>seg({x:10,y:40+i*10},{x:780,y:240+i*10}));
  const result=confirmSelectionPerspective(segments,q,width,height);
  assert.equal(result.horizontal.status,'unconfirmed');assert.equal(result.horizontal.lines.length,0);
  assert.deepEqual(result.coordinates,q);
});

test('selected edges and repeated fragments of one edge do not count as independent confirmations',()=>{
  const q=[{x:.2,y:.2},{x:.6,y:.2},{x:.6,y:.6},{x:.2,y:.6}];
  const segments=[seg({x:160,y:120},{x:480,y:120}),seg({x:160,y:360},{x:480,y:360}),seg({x:100,y:240},{x:200,y:240}),seg({x:260,y:240},{x:420,y:240})];
  const result=confirmSelectionPerspective(segments,q,width,height);
  assert.equal(result.horizontal.lines.length,1);assert.equal(result.horizontal.status,'limited');
  assert.equal(result.vertical.status,'unconfirmed');
});

test('parallel user edges have a valid direction at infinity; blank evidence remains unconfirmed',()=>{
  const q=[{x:.2,y:.2},{x:.6,y:.2},{x:.6,y:.6},{x:.2,y:.6}];
  const result=confirmSelectionPerspective([seg({x:20,y:60},{x:700,y:60}),seg({x:40,y:420},{x:760,y:420})],q,width,height);
  assert.equal(result.horizontal.status,'supported');
  assert.equal(confirmSelectionPerspective([],q,width,height).horizontal.status,'unconfirmed');
});

test('image detector finds real continuous edge lines and does not invent lines in a blank image',()=>{
  const w=320,h=240,gray=new Uint8Array(w*h).fill(210);
  for(const y of [35,85,145,200])for(let x=25;x<290;x++)for(let dy=0;dy<3;dy++)gray[(y+dy)*w+x]=25;
  for(const x of [50,160,265])for(let y=20;y<220;y++)for(let dx=0;dx<3;dx++)gray[y*w+x+dx]=25;
  const detected=detectFacadeLines(gray,w,h);
  assert.ok(detected.filter(s=>Math.abs(s.end.y-s.start.y)<2&&Math.abs(s.end.x-s.start.x)>40).length>=3);
  assert.ok(detected.filter(s=>Math.abs(s.end.x-s.start.x)<2&&Math.abs(s.end.y-s.start.y)>40).length>=2);
  assert.deepEqual(detectFacadeLines(new Uint8Array(w*h).fill(150),w,h),[]);
});

test('malformed, self-crossing and degenerate selections are rejected without reordering',()=>{
  for(const q of [[],[{x:0,y:0},{x:1,y:1},{x:1,y:0},{x:0,y:1}],[{x:0,y:0},{x:0,y:0},{x:1,y:1},{x:0,y:1}],[{x:0,y:0},{x:2,y:0},{x:1,y:1},{x:0,y:1}]])assert.throws(()=>validatePerspectiveCoordinates(q));
});
