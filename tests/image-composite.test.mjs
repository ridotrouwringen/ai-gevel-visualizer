import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { compositeGeneratedProduct } from "../.test-build/lib/image-composite.js";

test("composite preserves the original image outside the selected area and under transparent pixels", async () => {
  const base = await sharp({
    create: { width: 4, height: 4, channels: 3, background: { r: 10, g: 20, b: 30 } },
  }).png().toBuffer();
  const product = Buffer.from([255, 0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0]);
  const alpha = Buffer.from([255, 0, 255, 255]);
  const output = await compositeGeneratedProduct(base, product, alpha, 2, 2, 1, 1);
  const raw = await sharp(output).removeAlpha().raw().toBuffer();
  assert.deepEqual(Array.from(raw.slice(0, 3)), [10, 20, 30]);
  assert.deepEqual(Array.from(raw.slice((1 * 4 + 1) * 3, (1 * 4 + 1) * 3 + 3)), [255, 0, 0]);
  assert.deepEqual(Array.from(raw.slice((1 * 4 + 2) * 3, (1 * 4 + 2) * 3 + 3)), [10, 20, 30]);
});

test("off-photo cassette is clipped at photo edge without changing the rest", async () => {
  const base = await sharp({create:{width:5,height:5,channels:3,background:{r:11,g:22,b:33}}}).png().toBuffer();
  const rgb=Buffer.alloc(3*3*3,200), alpha=Buffer.alloc(3*3,255);
  const out=await compositeGeneratedProduct(base,rgb,alpha,3,3,-1,-1);
  const raw=await sharp(out).removeAlpha().raw().toBuffer();
  for(let y=0;y<5;y++)for(let x=0;x<5;x++) {
    const i=(y*5+x)*3;
    assert.deepEqual([...raw.subarray(i,i+3)],x<2&&y<2?[200,200,200]:[11,22,33]);
  }
});

// A full-photo reference overlay avoids any crop operation in the oracle.
for (const [left,top] of [[-2,2],[6,2],[2,-2],[2,6],[-2,-2],[6,-2],[-2,6],[6,6],[-9,2],[9,2],[2,-9],[2,9]]) {
  test(`clipping keeps RGB/alpha aligned at ${left},${top}`,async()=>{
    const width=8,height=8,size=4;
    const base=await sharp({create:{width,height,channels:4,background:{r:11,g:22,b:33,alpha:0.8}}}).png().toBuffer();
    const rgb=Buffer.alloc(size*size*3),alpha=Buffer.alloc(size*size);
    const full=Buffer.alloc(width*height*4);
    for(let y=0;y<size;y++)for(let x=0;x<size;x++){
      const i=y*size+x;rgb.set([50+x*40,60+y*40,200],i*3);alpha[i]=[0,85,170,255][(x+y)%4];
      const gx=x+left,gy=y+top;
      if(gx>=0&&gx<width&&gy>=0&&gy<height)full.set([...rgb.subarray(i*3,i*3+3),alpha[i]],(gy*width+gx)*4);
    }
    const overlay=await sharp(full,{raw:{width,height,channels:4}}).png().toBuffer();
    const expected=await sharp(base).composite([{input:overlay}]).raw().toBuffer();
    const actual=await sharp(await compositeGeneratedProduct(base,rgb,alpha,size,size,left,top)).raw().toBuffer();
    assert.deepEqual(actual,expected);
  });
}
test('overlapping clipped masks preserve transparent holes and untouched photo',async()=>{
 const width=6,height=6;
 const base=await sharp({create:{width,height,channels:3,background:{r:11,g:22,b:33}}}).png().toBuffer();
 let actual=base;const expected=Buffer.alloc(width*height*3);for(let i=0;i<width*height;i++)expected.set([11,22,33],i*3);
 for(const [left,top,colour] of [[-1,-1,[190,20,30]],[1,-1,[20,190,30]],[3,3,[20,30,190]]]){
  const rgb=Buffer.alloc(4*4*3),alpha=Buffer.alloc(16);
  for(let y=0;y<4;y++)for(let x=0;x<4;x++){
   const i=y*4+x;rgb.set(colour,i*3);alpha[i]=(x+y)%3===0?0:255;
   const gx=left+x,gy=top+y;
   if(alpha[i]&&gx>=0&&gx<width&&gy>=0&&gy<height)expected.set(colour,(gy*width+gx)*3);
  }
  actual=await compositeGeneratedProduct(actual,rgb,alpha,4,4,left,top);
 }
 assert.deepEqual(await sharp(actual).removeAlpha().raw().toBuffer(),expected);
});
