"use client";

import { useRef, ChangeEvent, useEffect, useState, PointerEvent } from 'react';
import { useVisualizerStore } from '@/store/visualizer-store';
import { UploadCloud, Trash2, MousePointer2 } from 'lucide-react';
import { SYSTEM_COLORS, ZIPSCREEN_FABRICS, AWNING_FABRICS, ProductType, SystemColor, FabricColor } from '@/types/visualizer';

const getColorHex = (id: SystemColor | FabricColor | null) => {
  if (!id) return '#000000';
  const allColors = [...SYSTEM_COLORS, ...ZIPSCREEN_FABRICS, ...AWNING_FABRICS];
  return allColors.find(c => c.id === id)?.hex || '#000000';
};

const isPointInPolygon = (point: { x: number; y: number }, vs: { x: number; y: number }[]) => {
  let inside = false;
  for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
    const xi = vs[i].x, yi = vs[i].y;
    const xj = vs[j].x, yj = vs[j].y;
    const intersect = ((yi > point.y) !== (yj > point.y)) && (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
};

const isPointNearLine = (px: number, py: number, x1: number, y1: number, x2: number, y2: number, threshold = 15) => {
  const l2 = (x2 - x1) ** 2 + (y2 - y1) ** 2;
  if (l2 === 0) return Math.hypot(px - x1, py - y1) < threshold;
  let t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2;
  t = Math.max(0, Math.min(1, t));
  const projX = x1 + t * (x2 - x1);
  const projY = y1 + t * (y2 - y1);
  return Math.hypot(px - projX, py - projY) < threshold;
};

export function FacadeCanvas() {
  const {
    originalImage, setOriginalImage, clearMasks, masks, addMask,
    activeProduct, activeSystemColor, activeFabricColor
  } = useVisualizerStore();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  const [dragStart, setDragStart] = useState<{ x: number, y: number } | null>(null);
  const [dragCurrent, setDragCurrent] = useState<{ x: number, y: number } | null>(null);
  const [polygonPoints, setPolygonPoints] = useState<{ x: number, y: number }[]>([]);
  const [segmentError, setSegmentError] = useState<string | null>(null);
  // Debug view: this is the exact raster mask stored in Zustand and sent
  // unchanged to /api/replicate as selection.rasterMasks.
  const [showGenerationMask, setShowGenerationMask] = useState(true);
  const [mountingMode, setMountingMode] = useState<'IN_DE_DAG' | 'OP_DE_DAG'>('OP_DE_DAG');

  const handleImageUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSegmentError(null);
    setOriginalImage(URL.createObjectURL(file));
  };

  const drawCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.lineCap = 'round';

    const imageWidth = imgRef.current?.naturalWidth || canvas.width;
    const imageHeight = imgRef.current?.naturalHeight || canvas.height;

    masks.forEach((mask) => {
      const hexColor = getColorHex(mask.fabricColor || mask.systemColor);

      if (mask.type === 'RASTER_MASK' && mask.rasterMasks?.length) {
        const maskCanvas = document.createElement('canvas');
        maskCanvas.width = canvas.width;
        maskCanvas.height = canvas.height;
        const maskCtx = maskCanvas.getContext('2d');
        if (maskCtx) {
          const imageWidth = imgRef.current?.naturalWidth || canvas.width;
          const imageHeight = imgRef.current?.naturalHeight || canvas.height;
          const imageScaleX = canvas.width / imageWidth;
          const imageScaleY = canvas.height / imageHeight;
          mask.rasterMasks.forEach((raster) => {
            const local = maskCtx.createImageData(raster.width, raster.height);
            for (let i = 0; i < raster.width * raster.height; i++) {
              const on = raster.data[i] > 0;
              // Vivid magenta makes the exact binary generation mask easy to
              // inspect against the original facade. Pixels outside the mask
              // remain fully transparent.
              local.data[i * 4] = 255;
              local.data[i * 4 + 1] = 0;
              local.data[i * 4 + 2] = 180;
              local.data[i * 4 + 3] = on && showGenerationMask ? 145 : 0;
            }
            const localCanvas = document.createElement('canvas');
            localCanvas.width = raster.width;
            localCanvas.height = raster.height;
            const localCtx = localCanvas.getContext('2d');
            if (!localCtx) return;
            localCtx.putImageData(local, 0, 0);
            maskCtx.drawImage(
              localCanvas,
              raster.offsetX * imageScaleX,
              raster.offsetY * imageScaleY,
              raster.width * imageScaleX,
              raster.height * imageScaleY
            );
          });
          if (showGenerationMask) {
            ctx.save();
            ctx.globalCompositeOperation = 'source-over';
            ctx.globalAlpha = 1;
            ctx.drawImage(maskCanvas, 0, 0);
            ctx.restore();
          }
        }
        const midX = canvas.width * 0.5;
        const midY = canvas.height * 0.5;
        drawBadge(ctx, midX, midY, mask.sequenceNumber, hexColor);
      }

      else if (mask.type === 'POLYGON') {
        ctx.beginPath();
        mask.coordinates.forEach((coord, i) => {
          const x = coord.x * canvas.width;
          const y = coord.y * canvas.height;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.closePath();

        ctx.fillStyle = `${hexColor}66`;
        ctx.fill();
        ctx.strokeStyle = hexColor;
        ctx.lineWidth = 2;
        ctx.stroke();

        const midX = mask.coordinates.reduce((sum, c) => sum + c.x, 0) / mask.coordinates.length * canvas.width;
        const midY = mask.coordinates.reduce((sum, c) => sum + c.y, 0) / mask.coordinates.length * canvas.height;
        drawBadge(ctx, midX, midY, mask.sequenceNumber, hexColor);
      }

      else if (mask.type === 'LINE' && mask.coordinates.length === 2) {
        const startX = mask.coordinates[0].x * canvas.width;
        const startY = mask.coordinates[0].y * canvas.height;
        const endX = mask.coordinates[1].x * canvas.width;
        const endY = mask.coordinates[1].y * canvas.height;

        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(endX, endY);
        ctx.strokeStyle = hexColor;
        ctx.lineWidth = 4;
        ctx.stroke();

        drawBadge(ctx, (startX + endX) / 2, (startY + endY) / 2, mask.sequenceNumber, hexColor);
      }
    });

    if (polygonPoints.length > 0 && activeProduct !== 'KNIKARMSCHERMEN') {
      const hexColor = getColorHex(activeFabricColor || activeSystemColor);
      ctx.save();
      ctx.strokeStyle = hexColor;
      ctx.fillStyle = `${hexColor}22`;
      ctx.lineWidth = 3;
      ctx.setLineDash([7, 5]);
      ctx.beginPath();
      polygonPoints.forEach((point, index) => {
        const x = point.x * canvas.width;
        const y = point.y * canvas.height;
        if (index === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      if (polygonPoints.length === 4) ctx.closePath();
      ctx.stroke();
      if (polygonPoints.length === 4) ctx.fill();
      ctx.setLineDash([]);
      polygonPoints.forEach((point, index) => {
        const x = point.x * canvas.width;
        const y = point.y * canvas.height;
        ctx.beginPath();
        ctx.arc(x, y, 7, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.strokeStyle = hexColor;
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.fillStyle = hexColor;
        ctx.font = 'bold 12px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(index + 1), x, y);
      });
      ctx.restore();
    }

    if (activeProduct === 'KNIKARMSCHERMEN' && dragStart && dragCurrent) {
      const hexColor = getColorHex(activeFabricColor || activeSystemColor);
      ctx.strokeStyle = `${hexColor}DD`;
      ctx.setLineDash([7, 5]);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(dragStart.x * canvas.width, dragStart.y * canvas.height);
      ctx.lineTo(dragCurrent.x * canvas.width, dragCurrent.y * canvas.height);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  };

  const drawBadge = (ctx: CanvasRenderingContext2D, x: number, y: number, text: number, color: string) => {
    ctx.beginPath();
    ctx.arc(x, y, 12, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 14px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text.toString(), x, y);
  };

  useEffect(() => {
    drawCanvas();
    window.addEventListener('resize', drawCanvas);
    return () => window.removeEventListener('resize', drawCanvas);
  }, [masks, polygonPoints, dragStart, dragCurrent, originalImage, showGenerationMask, mountingMode]);

  // The drag rectangle is the complete and authoritative generation mask for
  // Rolluiken and screens use only the exact four-point user selection.
  const buildPolygonRasterMask = (
    points: { x: number; y: number }[],
    imageWidth: number,
    imageHeight: number
  ) => {
    const pixelPoints = points.map((point) => ({ x: point.x * imageWidth, y: point.y * imageHeight }));
    const left = Math.max(0, Math.floor(Math.min(...pixelPoints.map((p) => p.x))));
    const top = Math.max(0, Math.floor(Math.min(...pixelPoints.map((p) => p.y))));
    const right = Math.min(imageWidth, Math.ceil(Math.max(...pixelPoints.map((p) => p.x))));
    const bottom = Math.min(imageHeight, Math.ceil(Math.max(...pixelPoints.map((p) => p.y))));
    const width = Math.max(1, right - left);
    const height = Math.max(1, bottom - top);

    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = width;
    maskCanvas.height = height;
    const maskCtx = maskCanvas.getContext('2d');
    if (!maskCtx) throw new Error('De selectie kon niet worden opgebouwd.');

    maskCtx.fillStyle = '#ffffff';
    maskCtx.beginPath();
    pixelPoints.forEach((point, index) => {
      const x = point.x - left;
      const y = point.y - top;
      if (index === 0) maskCtx.moveTo(x, y); else maskCtx.lineTo(x, y);
    });
    maskCtx.closePath();
    maskCtx.fill();

    const imageData = maskCtx.getImageData(0, 0, width, height);
    const data = new Array<number>(width * height);
    for (let i = 0; i < data.length; i++) data[i] = imageData.data[i * 4 + 3] > 0 ? 255 : 0;
    return { data, width, height, offsetX: left, offsetY: top };
  };

  const getPointerPosition = (e: PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();

    return {
      x: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height))
    };
  };

  const handlePointerDown = (e: PointerEvent<HTMLCanvasElement>) => {
    const position = getPointerPosition(e);
    if (!position) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setSegmentError(null);

    if (activeProduct === 'KNIKARMSCHERMEN') {
      setDragStart(position);
      setDragCurrent(position);
      return;
    }

    const nextPoints = [...polygonPoints, position];
    if (nextPoints.length < 4) {
      setPolygonPoints(nextPoints);
      return;
    }

    const imageWidth = imgRef.current?.naturalWidth;
    const imageHeight = imgRef.current?.naturalHeight;
    if (!imageWidth || !imageHeight) {
      setPolygonPoints([]);
      setSegmentError('De afmetingen van de foto konden niet worden bepaald.');
      return;
    }

    const rasterMask = buildPolygonRasterMask(nextPoints, imageWidth, imageHeight);
    setShowGenerationMask(true);
    addMask({
      type: 'RASTER_MASK',
      coordinates: nextPoints,
      rasterMasks: [rasterMask],
      productType: activeProduct,
      systemColor: activeSystemColor,
      fabricColor: activeFabricColor || undefined,
      mountingMode: activeProduct === 'ROLLUIKEN' ? mountingMode : undefined,
    });
    setPolygonPoints([]);
  };

  const handlePointerMove = (e: PointerEvent<HTMLCanvasElement>) => {
    if (activeProduct !== 'KNIKARMSCHERMEN' || !dragStart) return;
    const position = getPointerPosition(e);
    if (!position) return;
    setDragCurrent(position);
  };

  const handlePointerUp = async (e: PointerEvent<HTMLCanvasElement>) => {
    if (activeProduct !== 'KNIKARMSCHERMEN' || !dragStart) return;
    const end = getPointerPosition(e);
    if (!end) {
      setDragStart(null);
      setDragCurrent(null);
      return;
    }

    const start = dragStart;
    setDragStart(null);
    setDragCurrent(null);

    if (Math.abs(end.x - start.x) < 0.01) {
      setSegmentError('Sleep over de gewenste breedte van het knikarmscherm.');
      return;
    }

    const y = start.y;
    addMask({
      type: 'LINE',
      coordinates: [
        { x: Math.min(start.x, end.x), y },
        { x: Math.max(start.x, end.x), y }
      ],
      productType: activeProduct,
      systemColor: activeSystemColor,
      fabricColor: activeFabricColor || undefined
    });
  };

  const resetPolygonSelection = () => {
    setPolygonPoints([]);
    setSegmentError(null);
  };

  if (!originalImage) {
    return (
      <div className="max-w-3xl w-full text-center border-2 border-dashed border-gray-300 rounded-xl p-12 bg-white flex flex-col items-center justify-center shadow-sm">
         <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4 border border-gray-100">
           <UploadCloud className="w-8 h-8 text-gray-500" />
         </div>
         <h3 className="text-lg font-semibold text-gray-900 mb-2">Upload een gevel foto</h3>
         <p className="text-gray-500 mb-6 max-w-md">Kies een duidelijke foto van de voor- of achterkant van het huis. Zorg dat de ramen goed zichtbaar zijn.</p>
         <input type="file" accept="image/jpeg, image/png, image/webp" className="hidden" ref={fileInputRef} onChange={handleImageUpload} />
         <button onClick={() => fileInputRef.current?.click()} className="bg-white border border-gray-300 text-gray-700 font-medium py-2 px-6 rounded-md hover:bg-gray-50 transition-colors shadow-sm">
           Kies Afbeelding
         </button>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full flex items-center justify-center bg-gray-200 rounded-xl overflow-hidden shadow-inner p-4">
      <div className="relative inline-block max-w-full max-h-full" ref={containerRef}>
        <img
          src={originalImage}
          alt="Gevel"
          ref={imgRef}
          onLoad={drawCanvas}
          className="block max-w-full max-h-[80vh] object-contain shadow-md rounded-sm"
        />
        <canvas
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={() => {
            setDragStart(null);
            setDragCurrent(null);
          }}
          className="absolute top-0 left-0 w-full h-full rounded-sm cursor-crosshair"
          style={{ touchAction: 'none' }}
        />
      </div>

      {masks.some((mask) => mask.type === 'RASTER_MASK' && mask.rasterMasks?.length) && (
        <button
          type="button"
          onClick={() => setShowGenerationMask((visible) => !visible)}
          className="absolute top-4 right-4 z-20 bg-fuchsia-600/95 hover:bg-fuchsia-700 text-white px-4 py-2 rounded-md text-sm shadow-lg font-semibold border border-white/30"
        >
          {showGenerationMask ? 'Mask verbergen' : 'Exacte generation-mask tonen'}
        </button>
      )}


      <div className="absolute top-16 right-4 z-20 bg-white/95 text-gray-900 rounded-lg shadow-lg border p-2 flex gap-1">
          <span className="text-xs font-semibold px-2 py-2">Montage</span>
          <button type="button" onClick={() => setMountingMode('IN_DE_DAG')} className={`px-3 py-1.5 rounded text-xs font-medium ${mountingMode === 'IN_DE_DAG' ? 'bg-green-600 text-white' : 'bg-gray-100'}`}>In de dag</button>
          <button type="button" onClick={() => setMountingMode('OP_DE_DAG')} className={`px-3 py-1.5 rounded text-xs font-medium ${mountingMode === 'OP_DE_DAG' ? 'bg-green-600 text-white' : 'bg-gray-100'}`}>Op de dag</button>
        </div>


      {showGenerationMask && masks.some((mask) => mask.type === 'RASTER_MASK' && mask.rasterMasks?.length) && (
        <div className="absolute bottom-4 left-4 z-20 bg-fuchsia-600/95 text-white px-4 py-2 rounded-md text-xs shadow-lg font-medium">
          EXACTE MASK → /api/replicate
        </div>
      )}

      <div className="absolute top-4 left-4 bg-black/80 backdrop-blur-sm text-white px-4 py-2 rounded-md text-sm flex items-center gap-2 shadow-lg">
        <MousePointer2 size={16} className={activeProduct === 'KNIKARMSCHERMEN' ? 'text-blue-400' : 'text-green-400'} />
        {segmentError ? segmentError : activeProduct === 'KNIKARMSCHERMEN'
          ? "Sleep over de gewenste breedte van het knikarmscherm."
          : "Klik 4 punten op de vier hoeken van het kozijn."
        }
      </div>

      {activeProduct !== 'KNIKARMSCHERMEN' && polygonPoints.length > 0 && (
        <button type="button" onClick={resetPolygonSelection} className="absolute top-16 left-4 z-20 bg-white/95 hover:bg-white text-gray-800 px-4 py-2 rounded-md text-sm shadow-lg font-semibold border">
          Opnieuw ({polygonPoints.length}/4)
        </button>
      )}

      <button
         onClick={() => { setOriginalImage(''); clearMasks(); }}
         className="absolute bottom-4 right-4 bg-white/90 hover:bg-white text-red-600 px-4 py-2 rounded-md text-sm shadow-md font-medium flex items-center gap-2 transition-colors"
      >
        <Trash2 size={16} />
        Nieuwe foto
      </button>
    </div>
  );
}
