export type PerspectivePoint = { x: number; y: number };

export function normalizePerspectiveQuad(points: PerspectivePoint[]): PerspectivePoint[] {
  if (points.length !== 4) throw new Error("Een perspectiefselectie vereist precies vier punten.");
  const sorted = [...points].sort((a, b) => a.y - b.y || a.x - b.x);
  const top = sorted.slice(0, 2).sort((a, b) => a.x - b.x);
  const bottom = sorted.slice(2, 4).sort((a, b) => a.x - b.x);
  return [top[0], top[1], bottom[1], bottom[0]];
}

type Homography = [number, number, number, number, number, number, number, number, number];

function solveLinearSystem(matrix: number[][], values: number[]): number[] {
  const n = values.length;
  const a = matrix.map((row, i) => [...row, values[i]]);

  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(a[row][col]) > Math.abs(a[pivot][col])) pivot = row;
    }
    if (Math.abs(a[pivot][col]) < 1e-10) {
      throw new Error("Ongeldige perspectiefgeometrie: de vier punten leveren geen unieke transformatie.");
    }
    [a[col], a[pivot]] = [a[pivot], a[col]];

    const divisor = a[col][col];
    for (let j = col; j <= n; j++) a[col][j] /= divisor;

    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const factor = a[row][col];
      if (factor === 0) continue;
      for (let j = col; j <= n; j++) a[row][j] -= factor * a[col][j];
    }
  }

  return a.map((row) => row[n]);
}

function destinationToSourceHomography(
  destination: PerspectivePoint[],
  sourceWidth: number,
  sourceHeight: number,
): Homography {
  const source = [
    { x: 0, y: 0 },
    { x: sourceWidth - 1, y: 0 },
    { x: sourceWidth - 1, y: sourceHeight - 1 },
    { x: 0, y: sourceHeight - 1 },
  ];

  const matrix: number[][] = [];
  const values: number[] = [];

  for (let i = 0; i < 4; i++) {
    const x = destination[i].x;
    const y = destination[i].y;
    const u = source[i].x;
    const v = source[i].y;

    matrix.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    values.push(u);
    matrix.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    values.push(v);
  }

  const solved = solveLinearSystem(matrix, values);
  return [
    solved[0], solved[1], solved[2],
    solved[3], solved[4], solved[5],
    solved[6], solved[7], 1,
  ];
}

function sampleBilinear(
  sourceRgb: Buffer,
  sourceAlpha: Buffer,
  width: number,
  height: number,
  x: number,
  y: number,
): [number, number, number, number] {
  if (x < 0 || y < 0 || x > width - 1 || y > height - 1) return [0, 0, 0, 0];

  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(width - 1, x0 + 1);
  const y1 = Math.min(height - 1, y0 + 1);
  const fx = x - x0;
  const fy = y - y0;

  const samples: [number, number, number][] = [
    [x0, y0, (1 - fx) * (1 - fy)],
    [x1, y0, fx * (1 - fy)],
    [x0, y1, (1 - fx) * fy],
    [x1, y1, fx * fy],
  ];

  let r = 0, g = 0, b = 0, a = 0;
  for (const [sx, sy, weight] of samples) {
    const index = sy * width + sx;
    const rgb = index * 3;
    r += sourceRgb[rgb] * weight;
    g += sourceRgb[rgb + 1] * weight;
    b += sourceRgb[rgb + 2] * weight;
    a += sourceAlpha[index] * weight;
  }

  return [Math.round(r), Math.round(g), Math.round(b), Math.round(a)];
}

export function perspectiveWarpRgba(
  sourceRgb: Buffer,
  sourceAlpha: Buffer,
  sourceWidth: number,
  sourceHeight: number,
  quad: PerspectivePoint[],
) {
  if (quad.length !== 4) throw new Error("Een perspectieftransformatie vereist precies vier punten.");
  if (sourceWidth < 2 || sourceHeight < 2) throw new Error("Het product is te klein voor een perspectieftransformatie.");

  const xs = quad.map((point) => point.x);
  const ys = quad.map((point) => point.y);
  const offsetX = Math.floor(Math.min(...xs));
  const offsetY = Math.floor(Math.min(...ys));
  const right = Math.ceil(Math.max(...xs));
  const bottom = Math.ceil(Math.max(...ys));
  const width = Math.max(1, right - offsetX + 1);
  const height = Math.max(1, bottom - offsetY + 1);

  const destination = quad.map((point) => ({
    x: point.x - offsetX,
    y: point.y - offsetY,
  }));
  const homography = destinationToSourceHomography(destination, sourceWidth, sourceHeight);
  const rgba = Buffer.alloc(width * height * 4);

  for (let y = 0; y < height; y++) {
    const dy = y + 0.5;
    for (let x = 0; x < width; x++) {
      const dx = x + 0.5;
      const denominator = homography[6] * dx + homography[7] * dy + homography[8];
      const outputIndex = (y * width + x) * 4;
      if (Math.abs(denominator) < 1e-10) continue;

      const sx = (homography[0] * dx + homography[1] * dy + homography[2]) / denominator;
      const sy = (homography[3] * dx + homography[4] * dy + homography[5]) / denominator;
      const [r, g, b, a] = sampleBilinear(sourceRgb, sourceAlpha, sourceWidth, sourceHeight, sx, sy);

      rgba[outputIndex] = r;
      rgba[outputIndex + 1] = g;
      rgba[outputIndex + 2] = b;
      rgba[outputIndex + 3] = a;
    }
  }

  return { rgba, width, height, offsetX, offsetY };
}

/** Project a point in a unit rectangle into the same planar quad, also outside it. */
export function projectUnitPoint(quad: PerspectivePoint[], point: PerspectivePoint): PerspectivePoint {
  if (quad.length !== 4) throw new Error("Vier kozijnpunten zijn vereist.");
  const unit = [{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}];
  const matrix: number[][] = [], values: number[] = [];
  unit.forEach(({x,y}, i) => {
    const {x:u,y:v} = quad[i];
    matrix.push([x,y,1,0,0,0,-u*x,-u*y], [0,0,0,x,y,1,-v*x,-v*y]);
    values.push(u,v);
  });
  const h = solveLinearSystem(matrix, values);
  const d = h[6]*point.x + h[7]*point.y + 1;
  if (d <= 1e-8) throw new Error("Het productgebied kruist de perspectiefhorizon.");
  return {x:(h[0]*point.x+h[1]*point.y+h[2])/d, y:(h[3]*point.x+h[4]*point.y+h[5])/d};
}
