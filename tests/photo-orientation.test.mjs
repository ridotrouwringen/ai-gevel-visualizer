import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {orientFacadePhoto} from '../.test-build/lib/photo-orientation.js';
import {compositeGeneratedProduct} from '../.test-build/lib/image-composite.js';

// Six unequal pixels make rotation, mirroring and dimension swaps observable.
const pixels = Buffer.from([20,30,40, 50,60,70, 80,90,100, 110,120,130, 140,150,160, 170,180,190]);
const order = {
  1:[0,1,2,3,4,5], 2:[2,1,0,5,4,3], 3:[5,4,3,2,1,0], 4:[3,4,5,0,1,2],
  5:[0,3,1,4,2,5], 6:[3,0,4,1,5,2], 7:[5,2,4,1,3,0], 8:[2,5,1,4,0,3],
};
for (let orientation=1;orientation<=8;orientation++) {
  test(`EXIF ${orientation}: browser dimensions, exact pixels, no double rotation or collateral changes`, async()=>{
    const input=await sharp(pixels,{raw:{width:3,height:2,channels:3}}).withMetadata({orientation}).png().toBuffer();
    const normalized=await orientFacadePhoto(input);
    const {data,info}=await sharp(normalized).removeAlpha().raw().toBuffer({resolveWithObject:true});
    assert.equal(info.width,orientation>=5?2:3);assert.equal(info.height,orientation>=5?3:2);
    const expected=Buffer.concat(order[orientation].map(i=>pixels.subarray(i*3,i*3+3)));
    assert.deepEqual(data,expected);
    assert.strictEqual(await orientFacadePhoto(normalized),normalized);
    if(orientation!==1)assert.equal((await sharp(normalized).metadata()).orientation,undefined);
    // Selected upper-left pixel changes; every other visible photo pixel stays exact.
    const result=await compositeGeneratedProduct(normalized,Buffer.from([200,100,50]),Buffer.from([255]),1,1,0,0);
    const output=await sharp(result).removeAlpha().raw().toBuffer();
    assert.deepEqual(output.subarray(0,3),Buffer.from([200,100,50]));
    assert.deepEqual(output.subarray(3),expected.subarray(3));
  });
}
test('untagged photo keeps original bytes and decoded pixels',async()=>{
  const input=await sharp(pixels,{raw:{width:3,height:2,channels:3}}).png().toBuffer();
  assert.strictEqual(await orientFacadePhoto(input),input);
});
