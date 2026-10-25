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

type Mip = { rgb:Buffer; alpha:Buffer; width:number; height:number };

/** Area averages of the original material, with transparent pixels excluded
 * from colour. Alpha for the product silhouette is still sampled separately
 * from the unchanged full-resolution source below.
 */
function colourMips(rgb:Buffer, alpha:Buffer, width:number, height:number):Mip[] {
  const levels:Mip[]=[{rgb,alpha,width,height}];
  while(width>1||height>1){
    const previous=levels[levels.length-1],w=Math.ceil(width/2),h=Math.ceil(height/2);
    const next:Mip={rgb:Buffer.alloc(w*h*3),alpha:Buffer.alloc(w*h),width:w,height:h};
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
      let a=0,count=0;const sum=[0,0,0];
      for(let yy=y*2;yy<Math.min(y*2+2,height);yy++)for(let xx=x*2;xx<Math.min(x*2+2,width);xx++){
        const i=yy*width+xx,weight=previous.alpha[i];a+=weight;count++;
        for(let c=0;c<3;c++)sum[c]+=previous.rgb[i*3+c]*weight;
      }
      const i=y*w+x;next.alpha[i]=Math.round(a/count);
      if(a)for(let c=0;c<3;c++)next.rgb[i*3+c]=Math.round(sum[c]/a);
    }
    levels.push(next);width=w;height=h;
  }
  return levels;
}
function mipColour(level:Mip,x:number,y:number):number[]{
  x=Math.max(0,Math.min(level.width-1,x));y=Math.max(0,Math.min(level.height-1,y));
  const x0=Math.floor(x),y0=Math.floor(y),fx=x-x0,fy=y-y0,sum=[0,0,0];let alpha=0;
  for(const [xx,yy,w]of [[x0,y0,(1-fx)*(1-fy)],[Math.min(x0+1,level.width-1),y0,fx*(1-fy)],[x0,Math.min(y0+1,level.height-1),(1-fx)*fy],[Math.min(x0+1,level.width-1),Math.min(y0+1,level.height-1),fx*fy]]){
    const i=yy*level.width+xx,a=level.alpha[i]*w;alpha+=a;
    for(let c=0;c<3;c++)sum[c]+=level.rgb[i*3+c]*a;
  }
  return alpha?sum.map(v=>v/alpha):[0,0,0];
}

export function perspectiveWarpRgba(
  sourceRgb: Buffer,
  sourceAlpha: Buffer,
  sourceWidth: number,
  sourceHeight: number,
  quad: PerspectivePoint[],
  clip?: {left:number;top:number;right:number;bottom:number},
  filterRgb = false,
) {
  if (quad.length !== 4) throw new Error("Een perspectieftransformatie vereist precies vier punten.");
  if (sourceWidth < 2 || sourceHeight < 2) throw new Error("Het product is te klein voor een perspectieftransformatie.");

  const xs = quad.map((point) => point.x);
  const ys = quad.map((point) => point.y);
  const offsetX = Math.max(clip?.left ?? -Infinity, Math.floor(Math.min(...xs)));
  const offsetY = Math.max(clip?.top ?? -Infinity, Math.floor(Math.min(...ys)));
  const right = Math.min((clip?.right ?? Infinity)-1, Math.ceil(Math.max(...xs)));
  const bottom = Math.min((clip?.bottom ?? Infinity)-1, Math.ceil(Math.max(...ys)));
  const width = Math.max(1, right - offsetX + 1);
  const height = Math.max(1, bottom - offsetY + 1);

  const destination = quad.map((point) => ({
    x: point.x - offsetX,
    y: point.y - offsetY,
  }));
  const homography = destinationToSourceHomography(destination, sourceWidth, sourceHeight);
  const rgba = Buffer.alloc(width * height * 4);
  const mips = filterRgb ? colourMips(sourceRgb, sourceAlpha, sourceWidth, sourceHeight) : null;

  for (let y = 0; y < height; y++) {
    const dy = y + 0.5;
    for (let x = 0; x < width; x++) {
      const dx = x + 0.5;
      const denominator = homography[6] * dx + homography[7] * dy + homography[8];
      const outputIndex = (y * width + x) * 4;
      if (Math.abs(denominator) < 1e-10) continue;

      const sx = (homography[0] * dx + homography[1] * dy + homography[2]) / denominator;
      const sy = (homography[3] * dx + homography[4] * dy + homography[5]) / denominator;
      let [r, g, b, a] = sampleBilinear(sourceRgb, sourceAlpha, sourceWidth, sourceHeight, sx, sy);
      if(mips && a>0){
        // Local inverse-homography Jacobian: how many source texels cover this
        // destination pixel? Trilinear LOD avoids aliasing without sharpening
        // halos, inventing lamellae or changing alpha/geometry.
        const dsx=(homography[0]-sx*homography[6])/denominator;
        const dsy=(homography[3]-sy*homography[6])/denominator;
        const dtx=(homography[1]-sx*homography[7])/denominator;
        const dty=(homography[4]-sy*homography[7])/denominator;
        const lod=Math.min(mips.length-1,Math.log2(Math.max(1,Math.hypot(dsx,dsy),Math.hypot(dtx,dty))));
        if(lod>0){
          const low=Math.floor(lod),high=Math.min(mips.length-1,low+1),blend=lod-low;
          const c0=mipColour(mips[low],(sx+.5)/2**low-.5,(sy+.5)/2**low-.5);
          const c1=mipColour(mips[high],(sx+.5)/2**high-.5,(sy+.5)/2**high-.5);
          [r,g,b]=c0.map((v,c)=>Math.round(v*(1-blend)+c1[c]*blend));
        }
      }

      rgba[outputIndex] = r;
      rgba[outputIndex + 1] = g;
      rgba[outputIndex + 2] = b;
      rgba[outputIndex + 3] = a;
    }
  }

  return { rgba, width, height, offsetX, offsetY };
}

/** Compile the existing unit-rectangle mapping once for repeated sampling. */
export function unitQuadHomography(quad: PerspectivePoint[]): number[] {
  if (quad.length !== 4) throw new Error("Vier kozijnpunten zijn vereist.");
  const unit = [{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}];
  const matrix: number[][] = [], values: number[] = [];
  unit.forEach(({x,y}, i) => {
    const {x:u,y:v} = quad[i];
    matrix.push([x,y,1,0,0,0,-u*x,-u*y], [0,0,0,x,y,1,-v*x,-v*y]);
    values.push(u,v);
  });
  return [...solveLinearSystem(matrix, values), 1];
}

export function projectHomography(h: number[], point: PerspectivePoint): PerspectivePoint {
  const d = h[6]*point.x + h[7]*point.y + 1;
  if (d <= 1e-8) throw new Error("Het productgebied kruist de perspectiefhorizon.");
  return {x:(h[0]*point.x+h[1]*point.y+h[2])/d, y:(h[3]*point.x+h[4]*point.y+h[5])/d};
}

/** Project a point in a unit rectangle into the same planar quad, also outside it. */
export function projectUnitPoint(quad: PerspectivePoint[], point: PerspectivePoint): PerspectivePoint {
  return projectHomography(unitQuadHomography(quad), point);
}
