import assert from "node:assert/strict";
import test from "node:test";
import { AWNING_FABRICS, SYSTEM_COLORS, ZIPSCREEN_FABRICS } from "../.test-build/types/visualizer.js";
import { generationInputError } from "../.test-build/lib/replicate-validation.js";

test("supported product colours contain the commercial configuration options", () => {
  assert.deepEqual(SYSTEM_COLORS.map((color) => color.id), ["RAL_9005", "RAL_7016", "RAL_9010", "RAL_9001"]);
  assert.deepEqual(ZIPSCREEN_FABRICS.map((color) => color.id), ["LIGHT_GREY", "ANTHRACITE", "BLACK_GREY", "BLACK"]);
  assert.deepEqual(AWNING_FABRICS.map((color) => color.id), ["SAND", "LIGHT_GREY", "ANTHRACITE", "OCHRE_YELLOW"]);
});

test("generation validation rejects missing image and invalid geometry before Replicate is called", () => {
  assert.equal(generationInputError(null, []), "Geen afbeelding of selecties gevonden.");
  assert.equal(generationInputError("data:image/png;base64,AA==", [{ type: "RASTER_MASK", productType: "ROLLUIKEN", systemColor: "RAL_7016", coordinates: [] }]), "Een of meer selecties bevatten geen geldige montagegeometrie.");
  assert.equal(generationInputError("data:image/png;base64,AA==", [{ type: "LINE", productType: "KNIKARMSCHERMEN", systemColor: "RAL_9001", coordinates: [{ x: 0.2, y: 0.3 }, { x: 0.8, y: 0.3 }] }]), null);
});
