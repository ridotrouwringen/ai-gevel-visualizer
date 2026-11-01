export type Point = { x: number; y: number };

export type FrameQuad = {
  topLeft: Point;
  topRight: Point;
  bottomRight: Point;
  bottomLeft: Point;
};

export type RolluikMountingMode = "OP_DE_DAG" | "IN_DE_DAG";

export const ROLLUIK_DIMENSIONS_MM = {
  cassetteHeight: 180,
  guideWidth: 50,
  bottomRailHeight: 45,
  slatHeight: 45,
  opDeDagCassetteOffsetAboveFrame: 200,
} as const;

export type RolluikGeometry = {
  mountingMode: RolluikMountingMode;
  pantser: FrameQuad;
  leftGuide: FrameQuad;
  rightGuide: FrameQuad;
  cassette: FrameQuad;
  bottomRail: FrameQuad;
  slats: FrameQuad[];
};

function lerp(a: Point, b: Point, t: number): Point {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function add(a: Point, b: Point): Point {
  return { x: a.x + b.x, y: a.y + b.y };
}

function scale(a: Point, factor: number): Point {
  return { x: a.x * factor, y: a.y * factor };
}

function unit(a: Point): Point {
  const length = Math.hypot(a.x, a.y);
  if (length === 0) throw new Error("Ongeldige kozijngeometrie: rand heeft lengte 0.");
  return scale(a, 1 / length);
}

function distance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function pointAtPhysicalHeight(frame: FrameQuad, heightMm: number, frameHeightMm: number): [Point, Point] {
  const t = heightMm / frameHeightMm;
  return [
    lerp(frame.topLeft, frame.bottomLeft, t),
    lerp(frame.topRight, frame.bottomRight, t),
  ];
}

/**
 * Bouwt een rolluik vanuit een kozijn waarvan de werkelijke breedte/hoogte
 * bekend is. Dit is de voorkeursroute: fysieke maten worden via de vier
 * kozijnhoeken naar de foto geprojecteerd, in plaats van met één vaste
 * pixels-per-mm schaal.
 */
export function buildRolluikGeometryFromPhysicalFrame(
  frame: FrameQuad,
  frameWidthMm: number,
  frameHeightMm: number,
  mountingMode: RolluikMountingMode = "OP_DE_DAG",
): RolluikGeometry {
  if (!Number.isFinite(frameWidthMm) || frameWidthMm <= 0) {
    throw new Error("Een geldige fysieke kozijnbreedte in mm is nodig.");
  }
  if (!Number.isFinite(frameHeightMm) || frameHeightMm <= 0) {
    throw new Error("Een geldige fysieke kozijnhoogte in mm is nodig.");
  }

  const topEdge = unit({
    x: frame.topRight.x - frame.topLeft.x,
    y: frame.topRight.y - frame.topLeft.y,
  });
  const bottomEdge = unit({
    x: frame.bottomRight.x - frame.bottomLeft.x,
    y: frame.bottomRight.y - frame.bottomLeft.y,
  });
  const leftEdge = unit({
    x: frame.bottomLeft.x - frame.topLeft.x,
    y: frame.bottomLeft.y - frame.topLeft.y,
  });
  const rightEdge = unit({
    x: frame.bottomRight.x - frame.topRight.x,
    y: frame.bottomRight.y - frame.topRight.y,
  });

  const widthAtTop = distance(frame.topLeft, frame.topRight);
  const widthAtBottom = distance(frame.bottomLeft, frame.bottomRight);
  const pxPerMmTop = widthAtTop / frameWidthMm;
  const pxPerMmBottom = widthAtBottom / frameWidthMm;
  const pxPerMmLeft = distance(frame.topLeft, frame.bottomLeft) / frameHeightMm;
  const pxPerMmRight = distance(frame.topRight, frame.bottomRight) / frameHeightMm;

  const avgVerticalPxPerMm = (pxPerMmLeft + pxPerMmRight) / 2;
  const guideTop = ROLLUIK_DIMENSIONS_MM.guideWidth * pxPerMmTop;
  const guideBottom = ROLLUIK_DIMENSIONS_MM.guideWidth * pxPerMmBottom;
  const cassetteTopHeight = ROLLUIK_DIMENSIONS_MM.cassetteHeight * avgVerticalPxPerMm;
  const cassetteOffsetHeight =
    ROLLUIK_DIMENSIONS_MM.opDeDagCassetteOffsetAboveFrame * avgVerticalPxPerMm;
  const bottomRailHeight = ROLLUIK_DIMENSIONS_MM.bottomRailHeight * avgVerticalPxPerMm;
  const slatHeight = ROLLUIK_DIMENSIONS_MM.slatHeight * avgVerticalPxPerMm;

  if (mountingMode === "IN_DE_DAG") {
    const cassetteTop = pointAtPhysicalHeight(frame, ROLLUIK_DIMENSIONS_MM.cassetteHeight, frameHeightMm);
    const bottomRailTop = pointAtPhysicalHeight(
      frame,
      frameHeightMm - ROLLUIK_DIMENSIONS_MM.bottomRailHeight,
      frameHeightMm,
    );

    const cassette: FrameQuad = {
      topLeft: frame.topLeft,
      topRight: frame.topRight,
      bottomRight: cassetteTop[1],
      bottomLeft: cassetteTop[0],
    };

    const bottomRail: FrameQuad = {
      topLeft: bottomRailTop[0],
      topRight: bottomRailTop[1],
      bottomRight: frame.bottomRight,
      bottomLeft: frame.bottomLeft,
    };

    return {
      mountingMode,
      pantser: frame,
      leftGuide: buildGuide(frame, -guideTop, -guideBottom, "left", topEdge, bottomEdge),
      rightGuide: buildGuide(frame, guideTop, guideBottom, "right", topEdge, bottomEdge),
      cassette,
      bottomRail,
      slats: buildSlats(frame, ROLLUIK_DIMENSIONS_MM.cassetteHeight, ROLLUIK_DIMENSIONS_MM.bottomRailHeight, frameHeightMm),
    };
  }

  // OP DE DAG: het pantser volgt exact het kozijn. Geleiders liggen 50 mm
  // buiten het pantser. De bak ligt 200 mm boven het kozijn en is 180 mm hoog.
  const leftGuide = buildGuide(frame, guideTop, guideBottom, "left", topEdge, bottomEdge);
  const rightGuide = buildGuide(frame, guideTop, guideBottom, "right", topEdge, bottomEdge);

  const cassetteBottomLeft = add(frame.topLeft, scale(leftEdge, -cassetteOffsetHeight));
  const cassetteBottomRight = add(frame.topRight, scale(rightEdge, -cassetteOffsetHeight));
  const cassetteTopLeft = add(cassetteBottomLeft, scale(leftEdge, -cassetteTopHeight));
  const cassetteTopRight = add(cassetteBottomRight, scale(rightEdge, -cassetteTopHeight));

  const cassette: FrameQuad = {
    topLeft: cassetteTopLeft,
    topRight: cassetteTopRight,
    bottomRight: cassetteBottomRight,
    bottomLeft: cassetteBottomLeft,
  };

  const bottomRail: FrameQuad = {
    topLeft: add(frame.bottomLeft, scale(leftEdge, -bottomRailHeight)),
    topRight: add(frame.bottomRight, scale(rightEdge, -bottomRailHeight)),
    bottomRight: frame.bottomRight,
    bottomLeft: frame.bottomLeft,
  };

  return {
    mountingMode,
    pantser: frame,
    leftGuide,
    rightGuide,
    cassette,
    bottomRail,
    slats: buildSlats(frame, 0, ROLLUIK_DIMENSIONS_MM.bottomRailHeight, frameHeightMm),
  };
}

/**
 * Backwards-compatible scalar version. Useful for flat test images; production
 * geometry should use buildRolluikGeometryFromPhysicalFrame.
 */
export function buildRolluikGeometry(
  frame: FrameQuad,
  scalePxPerMm: number,
  mountingMode: RolluikMountingMode = "OP_DE_DAG",
): RolluikGeometry {
  if (!Number.isFinite(scalePxPerMm) || scalePxPerMm <= 0) {
    throw new Error("Een geldige pixels-per-mm schaal is nodig voor rolluikgeometrie.");
  }
  const frameWidthMm = distance(frame.topLeft, frame.topRight) / scalePxPerMm;
  const frameHeightMm = distance(frame.topLeft, frame.bottomLeft) / scalePxPerMm;
  return buildRolluikGeometryFromPhysicalFrame(frame, frameWidthMm, frameHeightMm, mountingMode);
}

function buildGuide(
  frame: FrameQuad,
  topOffset: number,
  bottomOffset: number,
  side: "left" | "right",
  topEdge: Point,
  bottomEdge: Point,
): FrameQuad {
  const top = side === "left" ? frame.topLeft : frame.topRight;
  const bottom = side === "left" ? frame.bottomLeft : frame.bottomRight;
  const topDirection = side === "left" ? scale(topEdge, -1) : topEdge;
  const bottomDirection = side === "left" ? scale(bottomEdge, -1) : bottomEdge;

  const outerTop = add(top, scale(unit(topDirection), topOffset));
  const outerBottom = add(bottom, scale(unit(bottomDirection), bottomOffset));

  return side === "left"
    ? { topLeft: outerTop, topRight: top, bottomRight: bottom, bottomLeft: outerBottom }
    : { topLeft: top, topRight: outerTop, bottomRight: outerBottom, bottomLeft: bottom };
}

function buildSlats(
  frame: FrameQuad,
  topOffsetMm: number,
  bottomOffsetMm: number,
  frameHeightMm: number,
): FrameQuad[] {
  const availableMm = frameHeightMm - topOffsetMm - bottomOffsetMm;
  const count = Math.max(1, Math.floor(availableMm / ROLLUIK_DIMENSIONS_MM.slatHeight));
  const result: FrameQuad[] = [];

  for (let i = 0; i < count; i++) {
    const topMm = topOffsetMm + i * ROLLUIK_DIMENSIONS_MM.slatHeight;
    const bottomMm = Math.min(
      topMm + ROLLUIK_DIMENSIONS_MM.slatHeight,
      frameHeightMm - bottomOffsetMm,
    );
    if (bottomMm <= topMm) break;

    const topT = topMm / frameHeightMm;
    const bottomT = bottomMm / frameHeightMm;

    result.push({
      topLeft: lerp(frame.topLeft, frame.bottomLeft, topT),
      topRight: lerp(frame.topRight, frame.bottomRight, topT),
      bottomRight: lerp(frame.topRight, frame.bottomRight, bottomT),
      bottomLeft: lerp(frame.topLeft, frame.bottomLeft, bottomT),
    });
  }

  return result;
}
