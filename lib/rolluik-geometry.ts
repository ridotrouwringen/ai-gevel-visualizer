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
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
  };
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

/**
 * Bouwt een rolluik op basis van het gedetecteerde kozijn.
 *
 * scalePxPerMm moet uit een echte schaalreferentie komen. We gebruiken bewust
 * geen vaste pixel-offsets: 200 mm is op een schuine gevel niet hetzelfde
 * aantal pixels als 200 mm elders in de foto.
 */
export function buildRolluikGeometry(
  frame: FrameQuad,
  scalePxPerMm: number,
  mountingMode: RolluikMountingMode = "OP_DE_DAG",
): RolluikGeometry {
  if (!Number.isFinite(scalePxPerMm) || scalePxPerMm <= 0) {
    throw new Error("Een geldige pixels-per-mm schaal is nodig voor rolluikgeometrie.");
  }

  const top = unit({
    x: frame.topRight.x - frame.topLeft.x,
    y: frame.topRight.y - frame.topLeft.y,
  });
  const left = unit({
    x: frame.bottomLeft.x - frame.topLeft.x,
    y: frame.bottomLeft.y - frame.topLeft.y,
  });
  const right = unit({
    x: frame.bottomRight.x - frame.topRight.x,
    y: frame.bottomRight.y - frame.topRight.y,
  });
  const bottom = unit({
    x: frame.bottomRight.x - frame.bottomLeft.x,
    y: frame.bottomRight.y - frame.bottomLeft.y,
  });

  const guide = ROLLUIK_DIMENSIONS_MM.guideWidth * scalePxPerMm;
  const cassette = ROLLUIK_DIMENSIONS_MM.cassetteHeight * scalePxPerMm;
  const bottomRail = ROLLUIK_DIMENSIONS_MM.bottomRailHeight * scalePxPerMm;
  const slat = ROLLUIK_DIMENSIONS_MM.slatHeight * scalePxPerMm;
  const cassetteOffset = ROLLUIK_DIMENSIONS_MM.opDeDagCassetteOffsetAboveFrame * scalePxPerMm;

  if (mountingMode === "IN_DE_DAG") {
    const cassetteQuad: FrameQuad = {
      topLeft: frame.topLeft,
      topRight: frame.topRight,
      bottomRight: add(frame.topRight, scale(right, cassette)),
      bottomLeft: add(frame.topLeft, scale(left, cassette)),
    };

    const bottomRailQuad: FrameQuad = {
      topLeft: add(frame.bottomLeft, scale(left, -bottomRail)),
      topRight: add(frame.bottomRight, scale(right, -bottomRail)),
      bottomRight: frame.bottomRight,
      bottomLeft: frame.bottomLeft,
    };

    const usableHeight = distance(frame.topLeft, frame.bottomLeft) - cassette - bottomRail;
    const slatCount = Math.max(1, Math.floor(usableHeight / slat));

    return {
      mountingMode,
      pantser: frame,
      leftGuide: stripAlongLeft(frame, guide),
      rightGuide: stripAlongRight(frame, guide),
      cassette: cassetteQuad,
      bottomRail: bottomRailQuad,
      slats: buildSlats(frame, cassette, bottomRail, slat, slatCount),
    };
  }

  // OP DE DAG:
  // - pantser blijft exact de maat van het gedetecteerde kozijn;
  // - geleiders komen 50 mm buiten het pantser;
  // - de bak is 180 mm hoog;
  // - de bak begint 200 mm boven het gedetecteerde kozijn.
  const pantser = frame;
  const leftGuide = offsetVerticalStrip(frame, -guide, "left");
  const rightGuide = offsetVerticalStrip(frame, guide, "right");

  const cassetteBottomLeft = add(frame.topLeft, scale(left, -cassetteOffset));
  const cassetteBottomRight = add(frame.topRight, scale(right, -cassetteOffset));
  const cassetteTopLeft = add(cassetteBottomLeft, scale(left, -cassette));
  const cassetteTopRight = add(cassetteBottomRight, scale(right, -cassette));

  const cassetteQuad: FrameQuad = {
    topLeft: cassetteTopLeft,
    topRight: cassetteTopRight,
    bottomRight: cassetteBottomRight,
    bottomLeft: cassetteBottomLeft,
  };

  const bottomRailQuad: FrameQuad = {
    topLeft: add(frame.bottomLeft, scale(left, -bottomRail)),
    topRight: add(frame.bottomRight, scale(right, -bottomRail)),
    bottomRight: frame.bottomRight,
    bottomLeft: frame.bottomLeft,
  };

  const usableHeight = distance(frame.topLeft, frame.bottomLeft) - bottomRail;
  const slatCount = Math.max(1, Math.floor(usableHeight / slat));

  return {
    mountingMode,
    pantser,
    leftGuide,
    rightGuide,
    cassette: cassetteQuad,
    bottomRail: bottomRailQuad,
    slats: buildSlats(frame, 0, bottomRail, slat, slatCount),
  };
}

function distance(a: Point, b: Point) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function stripAlongLeft(frame: FrameQuad, width: number): FrameQuad {
  return {
    topLeft: frame.topLeft,
    topRight: add(frame.topLeft, scale(unit({ x: frame.topRight.x - frame.topLeft.x, y: frame.topRight.y - frame.topLeft.y }), width)),
    bottomRight: add(frame.bottomLeft, scale(unit({ x: frame.bottomRight.x - frame.bottomLeft.x, y: frame.bottomRight.y - frame.bottomLeft.y }), width)),
    bottomLeft: frame.bottomLeft,
  };
}

function stripAlongRight(frame: FrameQuad, width: number): FrameQuad {
  return {
    topLeft: add(frame.topRight, scale(unit({ x: frame.topLeft.x - frame.topRight.x, y: frame.topLeft.y - frame.topRight.y }), width)),
    topRight: frame.topRight,
    bottomRight: frame.bottomRight,
    bottomLeft: add(frame.bottomRight, scale(unit({ x: frame.bottomLeft.x - frame.bottomRight.x, y: frame.bottomLeft.y - frame.bottomRight.y }), width)),
  };
}

function offsetVerticalStrip(frame: FrameQuad, offset: number, side: "left" | "right"): FrameQuad {
  const topDirection =
    side === "left"
      ? unit({ x: frame.topRight.x - frame.topLeft.x, y: frame.topRight.y - frame.topLeft.y })
      : unit({ x: frame.topLeft.x - frame.topRight.x, y: frame.topLeft.y - frame.topRight.y });

  const bottomDirection =
    side === "left"
      ? unit({ x: frame.bottomRight.x - frame.bottomLeft.x, y: frame.bottomRight.y - frame.bottomLeft.y })
      : unit({ x: frame.bottomLeft.x - frame.bottomRight.x, y: frame.bottomLeft.y - frame.bottomRight.y });

  const outerTop = side === "left" ? add(frame.topLeft, scale(topDirection, -offset)) : add(frame.topRight, scale(topDirection, -offset));
  const outerBottom = side === "left" ? add(frame.bottomLeft, scale(bottomDirection, -offset)) : add(frame.bottomRight, scale(bottomDirection, -offset));

  return side === "left"
    ? { topLeft: outerTop, topRight: frame.topLeft, bottomRight: frame.bottomLeft, bottomLeft: outerBottom }
    : { topLeft: frame.topRight, topRight: outerTop, bottomRight: outerBottom, bottomLeft: frame.bottomRight };
}

function buildSlats(
  frame: FrameQuad,
  topOffset: number,
  bottomOffset: number,
  slatHeight: number,
  count: number,
): FrameQuad[] {
  const result: FrameQuad[] = [];
  for (let i = 0; i < count; i++) {
    const topT = topOffset + i * slatHeight;
    const bottomT = Math.min(topT + slatHeight, distance(frame.topLeft, frame.bottomLeft) - bottomOffset);
    if (bottomT <= topT) break;

    const ratioTop = topT / distance(frame.topLeft, frame.bottomLeft);
    const ratioBottom = bottomT / distance(frame.topLeft, frame.bottomLeft);

    result.push({
      topLeft: lerp(frame.topLeft, frame.bottomLeft, ratioTop),
      topRight: lerp(frame.topRight, frame.bottomRight, ratioTop),
      bottomRight: lerp(frame.topRight, frame.bottomRight, ratioBottom),
      bottomLeft: lerp(frame.topLeft, frame.bottomLeft, ratioBottom),
    });
  }
  return result;
}
