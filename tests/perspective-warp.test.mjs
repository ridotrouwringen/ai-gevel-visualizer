import test from "node:test";
import assert from "node:assert/strict";
import { perspectiveWarpRgba } from "../.test-build/perspective-warp.js";

test("perspective warp preserves an identity rectangle", () => {
  const width = 4;
  const height = 4;
  const rgb = Buffer.alloc(width * height * 3);
  const alpha = Buffer.alloc(width * height, 255);

  for (let i = 0; i < width * height; i++) {
    rgb[i * 3] = 80;
    rgb[i * 3 + 1] = 100;
    rgb[i * 3 + 2] = 200;
  }

  const result = perspectiveWarpRgba(rgb, alpha, width, height, [
    { x: 0, y: 0 },
    { x: width - 1, y: 0 },
    { x: width - 1, y: height - 1 },
    { x: 0, y: height - 1 },
  ]);

  assert.equal(result.width, width);
  assert.equal(result.height, height);
  assert.equal(result.offsetX, 0);
  assert.equal(result.offsetY, 0);
  assert.equal(result.rgba[(1 * width + 1) * 4], 80);
  assert.equal(result.rgba[(1 * width + 1) * 4 + 3], 255);
});

test("perspective warp maps a rectangle into a slanted facade quad", () => {
  const width = 20;
  const height = 20;
  const rgb = Buffer.alloc(width * height * 3, 120);
  const alpha = Buffer.alloc(width * height, 255);

  const result = perspectiveWarpRgba(rgb, alpha, width, height, [
    { x: 2, y: 1 },
    { x: 18, y: 4 },
    { x: 16, y: 18 },
    { x: 1, y: 15 },
  ]);

  assert.ok(result.width >= 17);
  assert.ok(result.height >= 17);
  assert.equal(result.offsetX, 1);
  assert.equal(result.offsetY, 1);

  const center = ((Math.floor(result.height / 2) * result.width) + Math.floor(result.width / 2)) * 4;
  assert.equal(result.rgba[center + 3] > 0, true);
});
