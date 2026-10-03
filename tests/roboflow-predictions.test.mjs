import assert from "node:assert/strict";
import test from "node:test";
import { extractRoboflowPredictions } from "../.test-build/roboflow-predictions.js";

test("parses the exact Roboflow response shape used by main", () => {
  const payload = {
    result: {
      outputs: [
        {
          predictions: {
            image: { width: 1600, height: 1200 },
            predictions: [
              { x: 400, y: 300, width: 240, height: 360, confidence: 0.91, class: "kozijn" },
              { x: 1000, y: 500, width: 300, height: 420, confidence: 0.87, class: "kozijn" },
            ],
          },
        },
      ],
    },
  };

  assert.deepEqual(extractRoboflowPredictions(payload), [
    { x: 400, y: 300, width: 240, height: 360, confidence: 0.91, class: "kozijn" },
    { x: 1000, y: 500, width: 300, height: 420, confidence: 0.87, class: "kozijn" },
  ]);
});

test("rejects invalid boxes without hiding valid Roboflow detections", () => {
  const payload = {
    result: {
      outputs: [
        {
          predictions: {
            predictions: [
              { x: 100, y: 100, width: 200, height: 300 },
              { x: "bad", y: 50, width: 20, height: 20 },
              { x: 20, y: 20, width: 0, height: 10 },
            ],
          },
        },
      ],
    },
  };

  assert.deepEqual(extractRoboflowPredictions(payload), [
    { x: 100, y: 100, width: 200, height: 300, confidence: undefined, class: undefined },
  ]);
});

test("returns no detections for an unexpected response instead of crashing", () => {
  assert.deepEqual(extractRoboflowPredictions({ result: { outputs: [] } }), []);
  assert.deepEqual(extractRoboflowPredictions({}), []);
});
