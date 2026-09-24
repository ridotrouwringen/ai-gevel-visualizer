import { NextResponse } from "next/server";

export const maxDuration = 120;

const SAM3_VERSION =
  "vufinder/sam3:1bf97763d5dfd3a1584adca913a8ef4b43c684fca97e04e39e4c50a3a5e09650";

type Point = { x: number; y: number };
type Box = {
  cx: number;
  cy: number;
  w: number;
  h: number;
  score?: number;
};

type Point2D = { x: number; y: number };
type Detection = { box: Box; polygon?: Point2D[] };

type MaskCutout = {
  data: (number | boolean)[] | Uint8Array | Uint8ClampedArray;
  width: number;
  height: number;
  offsetX: number;
  offsetY: number;
  channels?: number;
};

function isNumberArray(value: unknown, length: number) {
  return (
    Array.isArray(value) &&
    value.length >= length &&
    value.slice(0, length).every((n) => typeof n === "number")
  );
}

function toBox(candidate: unknown): Box | null {
  if (!isNumberArray(candidate, 4)) return null;

  const [a, b, c, d] = candidate.slice(0, 4) as number[];

  // SAM3 uses normalized center_x, center_y, width, height for boxes.
  if (
    a >= 0 && a <= 1 &&
    b >= 0 && b <= 1 &&
    c > 0 && c <= 1 &&
    d > 0 && d <= 1
  ) {
    return { cx: a, cy: b, w: c, h: d };
  }

  return null;
}

function toPoint(candidate: unknown): Point2D | null {
  if (Array.isArray(candidate) && candidate.length >= 2) {
    const x = candidate[0];
    const y = candidate[1];
    if (typeof x === "number" && typeof y === "number") return { x, y };
  }

  if (candidate && typeof candidate === "object") {
    const object = candidate as Record<string, unknown>;
    if (typeof object.x === "number" && typeof object.y === "number") {
      return { x: object.x, y: object.y };
    }
  }

  return null;
}

function toPolygon(candidate: unknown): Point2D[] | null {
  if (!Array.isArray(candidate)) return null;

  const points = candidate.map(toPoint).filter((p): p is Point2D => Boolean(p));
  if (points.length < 3) return null;

  // Only accept normalized polygons here. Pixel-space masks can be added later
  // once their offset/size is available from the SAM result.
  if (points.every((p) => p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1)) {
    return points;
  }

  return null;
}

function decodeBase64(value: string): Uint8Array | null {
  try {
    const normalized = value.includes(",") ? value.split(",").pop() ?? "" : value;
    const binary = Buffer.from(normalized, "base64");
    return new Uint8Array(binary);
  } catch {
    return null;
  }
}

function flattenNumeric(value: unknown): (number | boolean)[] | null {
  if (Array.isArray(value)) {
    const out: (number | boolean)[] = [];
    for (const item of value) {
      const nested = flattenNumeric(item);
      if (nested) out.push(...nested);
      else if (typeof item === "number" || typeof item === "boolean") out.push(item);
      else return null;
    }
    return out;
  }
  return null;
}

function getImageDimensions(dataUrl: string) {
  try {
    const match = dataUrl.match(/^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/i);
    if (!match) return null;
    const bytes = Buffer.from(match[2], "base64");
    const type = match[1].toLowerCase();

    if (type === "png") {
      if (bytes.length >= 24) {
        return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
      }
    }

    if (type === "webp" && bytes.toString("ascii", 0, 4) === "RIFF") {
      const format = bytes.toString("ascii", 8, 12);
      if (format === "WEBP" && bytes.length >= 30) {
        const chunk = bytes.toString("ascii", 12, 16);
        if (chunk === "VP8X") {
          const width = 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16);
          const height = 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16);
          return { width, height };
        }
      }
    }

    if (type === "jpeg" || type === "jpg") {
      let offset = 2;
      while (offset + 9 < bytes.length) {
        if (bytes[offset] !== 0xff) {
          offset++;
          continue;
        }
        const marker = bytes[offset + 1];
        const length = bytes.readUInt16BE(offset + 2);
        if (
          marker >= 0xc0 &&
          marker <= 0xc3 &&
          offset + 8 < bytes.length
        ) {
          return {
            height: bytes.readUInt16BE(offset + 5),
            width: bytes.readUInt16BE(offset + 7),
          };
        }
        offset += 2 + length;
      }
    }
  } catch {
    // Fall back to normalized/legacy geometry below.
  }

  return null;
}

function collectMaskCutouts(value: unknown, output: MaskCutout[] = []): MaskCutout[] {
  if (!value || typeof value !== "object") return output;

  if (Array.isArray(value)) {
    for (const item of value) collectMaskCutouts(item, output);
    return output;
  }

  const object = value as Record<string, unknown>;

  const width =
    typeof object.width === "number"
      ? object.width
      : typeof object.w === "number"
        ? object.w
        : null;
  const height =
    typeof object.height === "number"
      ? object.height
      : typeof object.h === "number"
        ? object.h
        : null;

  const offset =
    Array.isArray(object.offset) && object.offset.length >= 2
      ? object.offset
      : null;

  const offsetX =
    offset && typeof offset[0] === "number"
      ? offset[0]
      : typeof object.offset_x === "number"
        ? object.offset_x
        : typeof object.x === "number"
          ? object.x
          : null;

  const offsetY =
    offset && typeof offset[1] === "number"
      ? offset[1]
      : typeof object.offset_y === "number"
        ? object.offset_y
        : typeof object.y === "number"
          ? object.y
          : null;

  const rawMask = object.mask ?? object.data ?? object.cutout;

  if (
    width &&
    height &&
    offsetX !== null &&
    offsetY !== null &&
    (Array.isArray(rawMask) || rawMask instanceof Uint8Array || rawMask instanceof Uint8ClampedArray)
  ) {
    const data =
      Array.isArray(rawMask)
        ? flattenNumeric(rawMask)
        : Array.from(rawMask);

    if (!data) return output;

    if (data.length >= width * height) {
      output.push({
        data,
        width,
        height,
        offsetX,
        offsetY,
        channels: typeof object.channels === "number" ? object.channels : undefined,
      });
    }
  }

  if (typeof rawMask === "string") {
    const decoded = decodeBase64(rawMask);
    if (decoded && width && height && offsetX !== null && offsetY !== null) {
      output.push({
        data: Array.from(decoded),
        width,
        height,
        offsetX,
        offsetY,
        channels: typeof object.channels === "number" ? object.channels : undefined,
      });
    }
  }

  for (const key of ["mask", "masks", "offset_masks", "cutout", "cutouts", "results", "predictions"]) {
    if (object[key] !== rawMask) collectMaskCutouts(object[key], output);
  }

  return output;
}

function maskToPolygon(mask: MaskCutout, imageWidth = 1, imageHeight = 1): Point2D[] | null {
  const channels = Math.max(1, mask.channels ?? 1);
  const points: Point2D[] = [];

  const isOn = (index: number) => {
    const value = mask.data[index];
    return typeof value === "boolean" ? value : Number(value) > 0;
  };

  const idx = (x: number, y: number) => (y * mask.width + x) * channels;

  // Sample the mask boundary rather than every pixel. This keeps the response
  // small enough for the frontend while retaining the actual perspective.
  const step = Math.max(1, Math.ceil(Math.max(mask.width, mask.height) / 180));

  for (let y = 0; y < mask.height; y += step) {
    for (let x = 0; x < mask.width; x += step) {
      const current = isOn(idx(x, y));
      if (!current) continue;

      const edge =
        x === 0 ||
        y === 0 ||
        x === mask.width - 1 ||
        y === mask.height - 1 ||
        !isOn(idx(Math.max(0, x - 1), y)) ||
        !isOn(idx(Math.min(mask.width - 1, x + 1), y)) ||
        !isOn(idx(x, Math.max(0, y - 1))) ||
        !isOn(idx(x, Math.min(mask.height - 1, y + 1)));

      if (edge) {
        points.push({
          x: (mask.offsetX + x) / imageWidth,
          y: (mask.offsetY + y) / imageHeight,
        });
      }
    }
  }

  return points.length >= 3 ? convexHull(points) : null;
}

function collectPolygons(value: unknown, output: Point2D[][] = []): Point2D[][] {
  if (!value || typeof value !== "object") return output;

  if (Array.isArray(value)) {
    const polygon = toPolygon(value);
    if (polygon) output.push(polygon);
    else for (const item of value) collectPolygons(item, output);
    return output;
  }

  const object = value as Record<string, unknown>;

  for (const key of ["polygon", "polygons", "contour", "contours", "points"]) {
    collectPolygons(object[key], output);
  }

  for (const key of ["segmentation", "mask", "masks"]) {
    const candidate = object[key];
    const polygon = toPolygon(candidate);
    if (polygon) output.push(polygon);
    else collectPolygons(candidate, output);
  }

  return output;
}

function convexHull(points: Point2D[]): Point2D[] {
  if (points.length <= 3) return points;

  const sorted = [...points].sort((a, b) =>
    a.x === b.x ? a.y - b.y : a.x - b.x
  );

  const cross = (o: Point2D, a: Point2D, b: Point2D) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

  const lower: Point2D[] = [];
  for (const point of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0) {
      lower.pop();
    }
    lower.push(point);
  }

  const upper: Point2D[] = [];
  for (const point of [...sorted].reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0) {
      upper.pop();
    }
    upper.push(point);
  }

  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

function collectBoxes(value: unknown, output: Box[] = []): Box[] {
  if (!value || typeof value !== "object") return output;

  if (Array.isArray(value)) {
    for (const item of value) collectBoxes(item, output);
    return output;
  }

  const object = value as Record<string, unknown>;

  for (const key of ["bbox", "box", "bounding_box", "boundingBox"]) {
    const candidate = object[key];
    const box = toBox(candidate);
    if (box) {
      const score =
        typeof object.score === "number"
          ? object.score
          : typeof object.confidence === "number"
            ? object.confidence
            : undefined;
      output.push({ ...box, score });
    }
  }

  for (const key of [
    "boxes",
    "bboxes",
    "detections",
    "instances",
    "predictions",
    "results",
  ]) {
    collectBoxes(object[key], output);
  }

  return output;
}

function boxEdges(box: Box) {
  return {
    left: Math.max(0, box.cx - box.w / 2),
    right: Math.min(1, box.cx + box.w / 2),
    top: Math.max(0, box.cy - box.h / 2),
    bottom: Math.min(1, box.cy + box.h / 2),
  };
}

function overlapLength(a1: number, a2: number, b1: number, b2: number) {
  return Math.max(0, Math.min(a2, b2) - Math.max(a1, b1));
}

function shouldBelongToSameKozijn(a: Box, b: Box) {
  const A = boxEdges(a);
  const B = boxEdges(b);

  const verticalOverlap =
    overlapLength(A.top, A.bottom, B.top, B.bottom) /
    Math.max(0.0001, Math.min(a.h, b.h));

  const horizontalOverlap =
    overlapLength(A.left, A.right, B.left, B.right) /
    Math.max(0.0001, Math.min(a.w, b.w));

  const horizontalGap =
    B.left > A.right
      ? B.left - A.right
      : A.left > B.right
        ? A.left - B.right
        : 0;

  const verticalGap =
    B.top > A.bottom
      ? B.top - A.bottom
      : A.top > B.bottom
        ? A.top - B.bottom
        : 0;

  const averageWidth = (a.w + b.w) / 2;
  const averageHeight = (a.h + b.h) / 2;
  const heightRatio = Math.max(a.h, b.h) / Math.max(0.0001, Math.min(a.h, b.h));
  const widthRatio = Math.max(a.w, b.w) / Math.max(0.0001, Math.min(a.w, b.w));

  // Same row: multi-pane kozijnen and dakkapellen often contain narrow panes
  // with a relatively small gap between them. Use both relative and absolute
  // tolerances so the grouping still works for small panes.
  const sameRow =
    verticalOverlap >= 0.45 &&
    horizontalGap <= Math.max(averageWidth * 0.9, averageHeight * 0.5, 0.02) &&
    Math.abs(a.cy - b.cy) <= Math.max(averageHeight * 0.65, 0.02) &&
    heightRatio <= 2.5;

  // Same column: useful for stacked parts of one kozijn.
  const sameColumn =
    horizontalOverlap >= 0.45 &&
    verticalGap <= Math.max(averageHeight * 0.55, averageWidth * 0.5, 0.02) &&
    Math.abs(a.cx - b.cx) <= Math.max(averageWidth * 0.65, 0.02) &&
    widthRatio <= 2.5;

  // Overlapping/contained segments are very likely parts of the same physical
  // window assembly (for example an open window sash).
  const overlapping =
    horizontalOverlap >= 0.35 && verticalOverlap >= 0.35;

  return sameRow || sameColumn || overlapping;
}

function buildKozijnGroup(detections: Detection[], point: Point) {
  const boxes = detections.map((d) => d.box);
  if (!boxes.length) return null;

  // Normally the click lies inside the SAM box. On a mullion, edge, or a
  // slightly imperfect SAM detection it may land just outside it. In that
  // case use the nearest box, but only when it is reasonably close to the
  // click; this avoids selecting a random window elsewhere in the facade.
  const clickedIndex = boxes.findIndex((box) => {
    const b = boxEdges(box);
    return (
      point.x >= b.left &&
      point.x <= b.right &&
      point.y >= b.top &&
      point.y <= b.bottom
    );
  });

  let seedIndex = clickedIndex;

  if (seedIndex < 0) {
    let nearestIndex = -1;
    let nearestDistance = Number.POSITIVE_INFINITY;

    boxes.forEach((box, index) => {
      const b = boxEdges(box);
      const dx =
        point.x < b.left ? b.left - point.x : point.x > b.right ? point.x - b.right : 0;
      const dy =
        point.y < b.top ? b.top - point.y : point.y > b.bottom ? point.y - b.bottom : 0;
      const distance = Math.hypot(dx, dy);

      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = index;
      }
    });

    if (nearestIndex >= 0 && nearestDistance <= 0.06) {
      seedIndex = nearestIndex;
    }
  }

  if (seedIndex < 0) return null;

  const selected = new Set<number>([seedIndex]);
  let changed = true;

  // Grow the group transitively. This allows A-B-C to become one kozijn even
  // when A and C do not directly touch each other.
  while (changed) {
    changed = false;

    for (let i = 0; i < boxes.length; i++) {
      if (selected.has(i)) continue;

      for (const selectedIndex of selected) {
        if (shouldBelongToSameKozijn(boxes[i], boxes[selectedIndex])) {
          selected.add(i);
          changed = true;
          break;
        }
      }
    }
  }

  const group = [...selected].map((index) => boxes[index]);

  const edges = group.map(boxEdges);
  const left = Math.min(...edges.map((b) => b.left));
  const right = Math.max(...edges.map((b) => b.right));
  const top = Math.min(...edges.map((b) => b.top));
  const bottom = Math.max(...edges.map((b) => b.bottom));

  const polygonPoints = [...selected]
    .flatMap((index) => detections[index].polygon ?? [])
    .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));

  const polygon =
    polygonPoints.length >= 3
      ? convexHull(polygonPoints)
      : [
          { x: left, y: top },
          { x: right, y: top },
          { x: right, y: bottom },
          { x: left, y: bottom },
        ];

  return {
    box: { left, top, right, bottom },
    polygon,
    memberCount: group.length,
    memberBoxes: group,
    clickedIndex: seedIndex,
  };
}

function summarizeShape(value: unknown, depth = 0): unknown {
  if (depth > 3) return typeof value;
  if (Array.isArray(value)) {
    return { type: "array", length: value.length, sample: value.length ? summarizeShape(value[0], depth + 1) : null };
  }
  if (!value || typeof value !== "object") return typeof value;
  const object = value as Record<string, unknown>;
  const summary: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(object)) {
    if (/^(data|mask|cutout)$/i.test(key) && Array.isArray(item)) {
      summary[key] = { type: "array", length: item.length };
    } else if (/^(data|mask|cutout)$/i.test(key) && typeof item === "string") {
      summary[key] = { type: "string", length: item.length };
    } else {
      summary[key] = summarizeShape(item, depth + 1);
    }
  }
  return summary;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const image = body?.image;
    const point = body?.point;

    if (
      typeof image !== "string" ||
      !point ||
      typeof point.x !== "number" ||
      typeof point.y !== "number"
    ) {
      return NextResponse.json(
        { error: "Afbeelding en klikpositie zijn verplicht." },
        { status: 400 }
      );
    }

    const apiKey = process.env.REPLICATE_API_TOKEN;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Replicate API Key ontbreekt in de Vercel kluis." },
        { status: 500 }
      );
    }

    const x = Math.max(0, Math.min(1, point.x));
    const y = Math.max(0, Math.min(1, point.y));

    const response = await fetch("https://api.replicate.com/v1/predictions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Prefer: "wait",
      },
      body: JSON.stringify({
        version: SAM3_VERSION,
        input: {
          image,
          prompts: [
            JSON.stringify({
              text: "window frame",
              positive_points: [[x, y]],
            }),
          ],
          confidence_threshold: 0.35,
          visualize: true,
          offset_masks: true,
          split_output: true,
        },
      }),
    });

    const prediction = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        {
          error:
            prediction?.detail ||
            prediction?.error ||
            "SAM 3 segmentatie mislukt.",
        },
        { status: response.status }
      );
    }

    if (prediction?.status === "failed") {
      return NextResponse.json(
        { error: prediction?.error || "SAM 3 segmentatie mislukt." },
        { status: 502 }
      );
    }

    const output = prediction?.output;
    const visualizationUrls: string[] = Array.isArray(output?.visualizations)
      ? output.visualizations.filter(
          (value: unknown): value is string => typeof value === "string"
        )
      : [];
    const resultUrls: string[] = Array.isArray(output?.results)
      ? output.results.filter(
          (value: unknown): value is string => typeof value === "string"
        )
      : [];

    const results: unknown[] = [];

    for (const resultUrl of resultUrls) {
      try {
        const resultResponse = await fetch(resultUrl);
        if (resultResponse.ok) {
          results.push(await resultResponse.json());
        }
      } catch {
        // Continue with the other result files.
      }
    }

    const boxes = collectBoxes(results);
    const polygons = collectPolygons(results);
    const maskCutouts = collectMaskCutouts(results);
    const imageDimensions = getImageDimensions(image);

    // SAM3's offset_masks output is the authoritative geometry. Convert the
    // returned cut-out masks to normalized boundary polygons using their
    // original-image pixel offsets. This preserves perspective and lets us
    // combine a fixed pane and an opening sash into one physical window area.
    const maskPolygons = maskCutouts
.map((mask) =>
        imageDimensions
          ? maskToPolygon(mask, imageDimensions.width, imageDimensions.height)
          : null
      )
      .filter((polygon): polygon is Point2D[] => Boolean(polygon));

    // Keep the legacy polygon path as a fallback for model/output variants
    // that expose polygon points directly.
    const allPolygons = maskPolygons.length ? maskPolygons : polygons;

    const detections: Detection[] = boxes.map((box) => {
      const polygon = allPolygons
        .map((candidate) => ({
          candidate,
          distance: Math.hypot(
            candidate.reduce((sum, p) => sum + p.x, 0) / candidate.length - box.cx,
            candidate.reduce((sum, p) => sum + p.y, 0) / candidate.length - box.cy
          ),
        }))
        .filter((item) => item.distance <= 0.35)
        .sort((a, b) => a.distance - b.distance)[0]?.candidate;

      return { box, polygon };
    });

    // Remove near-duplicate detections before grouping.
    const uniqueDetections = detections.filter((detection, index) => {
      const box = detection.box;
      return !detections.slice(0, index).some((otherDetection) => {
        const other = otherDetection.box;
        return (
          Math.abs(box.cx - other.cx) < 0.005 &&
          Math.abs(box.cy - other.cy) < 0.005 &&
          Math.abs(box.w - other.w) < 0.005 &&
          Math.abs(box.h - other.h) < 0.005
        );
      });
    });

    const uniqueBoxes = uniqueDetections.map((detection) => detection.box);
    const kozijn = buildKozijnGroup(uniqueDetections, { x, y });

    // Temporary diagnostic information: if SAM3 returns a different JSON
    // structure than expected, expose only its structure (never the image/mask
    // contents) so we can adapt the parser to the real output.
    const debugShape = boxes.length === 0
      ? results.map((result) => summarizeShape(result))
      : undefined;

    return NextResponse.json({
      ok: true,
      prompt: {
        text: "window frame",
        point: { x, y },
      },
      visualizationUrl: visualizationUrls[0] ?? null,
      visualizationUrls,
      resultUrl: resultUrls[0] ?? null,
      resultUrls,
      boxes: uniqueBoxes,
      polygons: allPolygons,
      maskCount: maskCutouts.length,
      kozijnPolygon: kozijn?.polygon ?? null,
      clickedBox:
        kozijn && uniqueBoxes[kozijn.clickedIndex]
          ? uniqueBoxes[kozijn.clickedIndex]
          : null,
      kozijnBox: kozijn?.box ?? null,
      kozijnMemberCount: kozijn?.memberCount ?? 0,
      kozijnMemberBoxes: kozijn?.memberBoxes ?? [],
      point: { x, y },
      debugShape,
    });
  } catch (error) {
    console.error("SAM 3 route error", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Onbekende fout tijdens SAM 3 segmentatie.",
      },
      { status: 500 }
    );
  }
}
