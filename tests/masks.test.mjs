import assert from "node:assert/strict";
import test from "node:test";
import { buildLineMask, buildRasterMask, getSelectionBounds } from "../.test-build/lib/masks.js";

test("rastermask keeps only selected pixels and reports its bounds", () => {
  const mask = buildRasterMask(5, 4, [{ data: [255, 0, 255, 255], width: 2, height: 2, offsetX: 2, offsetY: 1 }]);
  assert.deepEqual(getSelectionBounds(mask, 5, 4), { left: 2, top: 1, right: 4, bottom: 3 });
  assert.equal(mask[1 * 5 + 2], 255);
  assert.equal(mask[1 * 5 + 3], 0);
  assert.equal(mask[0], 0);
});

test("line mask converts awning geometry into the documented 20 percent mounting area", () => {
  const mask = buildLineMask(100, 100, [{ x: 0.2, y: 0.3 }, { x: 0.6, y: 0.3 }]);
  assert.deepEqual(getSelectionBounds(mask, 100, 100), { left: 20, top: 30, right: 60, bottom: 50 });
});
