import { buildRolluikGeometry, ROLLUIK_DIMENSIONS_MM, type FrameQuad } from "../lib/rolluik-geometry";

const frame: FrameQuad = {
  topLeft: { x: 100, y: 100 },
  topRight: { x: 1100, y: 100 },
  bottomRight: { x: 1100, y: 2100 },
  bottomLeft: { x: 100, y: 2100 },
};

const geometry = buildRolluikGeometry(frame, 1, "OP_DE_DAG");

if (ROLLUIK_DIMENSIONS_MM.cassetteHeight !== 180) throw new Error("Bak moet 180 mm zijn.");
if (ROLLUIK_DIMENSIONS_MM.guideWidth !== 50) throw new Error("Geleider moet 50 mm zijn.");
if (ROLLUIK_DIMENSIONS_MM.bottomRailHeight !== 45) throw new Error("Onderlijst moet 45 mm zijn.");
if (ROLLUIK_DIMENSIONS_MM.slatHeight !== 45) throw new Error("Lamellen moeten 45 mm zijn.");
if (ROLLUIK_DIMENSIONS_MM.opDeDagCassetteOffsetAboveFrame !== 200) throw new Error("Op-de-dag bakoffset moet 200 mm zijn.");

const pantserWidth = geometry.pantser.topRight.x - geometry.pantser.topLeft.x;
const pantserHeight = geometry.pantser.bottomLeft.y - geometry.pantser.topLeft.y;

if (pantserWidth !== 1000) throw new Error("Pantserbreedte moet exact de kozijnbreedte volgen.");
if (pantserHeight !== 2000) throw new Error("Pantserhoogte moet exact de kozijnhoogte volgen.");

const leftGuideWidth = geometry.leftGuide.topRight.x - geometry.leftGuide.topLeft.x;
const rightGuideWidth = geometry.rightGuide.topRight.x - geometry.rightGuide.topLeft.x;

if (leftGuideWidth !== 50) throw new Error("Linker geleider moet 50 px zijn bij 1 px/mm.");
if (rightGuideWidth !== 50) throw new Error("Rechter geleider moet 50 px zijn bij 1 px/mm.");

const cassetteHeight = geometry.cassette.bottomLeft.y - geometry.cassette.topLeft.y;
if (cassetteHeight !== 180) throw new Error("Bakhoogte moet exact 180 px zijn bij 1 px/mm.");

const cassetteGap = geometry.pantser.topLeft.y - geometry.cassette.bottomLeft.y;
if (cassetteGap !== 200) throw new Error("Bak moet 200 px boven het kozijn liggen bij 1 px/mm.");

const bottomRailHeight = geometry.bottomRail.bottomLeft.y - geometry.bottomRail.topLeft.y;
if (bottomRailHeight !== 45) throw new Error("Onderlijst moet exact 45 px zijn bij 1 px/mm.");

if (geometry.slats.length < 40) throw new Error("Een rolluik van 2000 mm moet meerdere 45 mm lamellen bevatten.");

const slatHeight = geometry.slats[0].bottomLeft.y - geometry.slats[0].topLeft.y;
if (slatHeight !== 45) throw new Error("Elke lamel moet 45 px hoog zijn bij 1 px/mm.");

console.log("Rolluik geometry tests: OK");
