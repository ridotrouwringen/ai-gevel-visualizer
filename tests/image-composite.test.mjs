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
  const raw = await sharp(output).raw().toBuffer();
  assert.deepEqual(Array.from(raw.slice(0, 3)), [10, 20, 30]);
  assert.deepEqual(Array.from(raw.slice((1 * 4 + 1) * 3, (1 * 4 + 1) * 3 + 3)), [255, 0, 0]);
  assert.deepEqual(Array.from(raw.slice((1 * 4 + 2) * 3, (1 * 4 + 2) * 3 + 3)), [10, 20, 30]);
});
