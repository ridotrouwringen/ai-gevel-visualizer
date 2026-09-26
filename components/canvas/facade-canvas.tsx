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
    originalImage, setOriginalImage, clearMasks, masks, addMask, removeMask,
    activeProduct, activeSystemColor, activeFabricColor
  } = useVisualizerStore();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  const [dragStart, setDragStart] = useState<{ x: number, y: number } | null>(null);
  const [dragCurrent, setDragCurrent] = useState<{ x: number, y: number } | null>(null);
  const [segmenting, setSegmenting] = useState(false);
  const [segmentationPreview, setSegmentationPreview] = useState<string | null>(null);
  const [segmentError, setSegmentError] = useState<string | null>(null);

  const handleImageUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result) setOriginalImage(event.target.result as string);
    };
    reader.readAsDataURL(file);
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
              const alpha = raster.data[i] > 0 ? 102 : 0;
              local.data[i * 4] = 255;
              local.data[i * 4 + 1] = 255;
              local.data[i * 4 + 2] = 255;
              local.data[i * 4 + 3] = alpha;
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
          ctx.save();
          ctx.globalCompositeOperation = 'source-over';
          ctx.globalAlpha = 0.8;
          ctx.drawImage(maskCanvas, 0, 0);
          ctx.restore();
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

    if (dragStart && dragCurrent) {
      const hexColor = getColorHex(activeFabricColor || activeSystemColor);
      const left = Math.min(dragStart.x, dragCurrent.x) * canvas.width;
      const right = Math.max(dragStart.x, dragCurrent.x) * canvas.width;
      const top = Math.min(dragStart.y, dragCurrent.y) * canvas.height;
      const bottom = Math.max(dragStart.y, dragCurrent.y) * canvas.height;

      ctx.strokeStyle = `${hexColor}DD`;
      ctx.setLineDash([7, 5]);
      ctx.lineWidth = 3;

      if (activeProduct === 'KNIKARMSCHERMEN') {
        ctx.beginPath();
        ctx.moveTo(dragStart.x * canvas.width, dragStart.y * canvas.height);
        ctx.lineTo(dragCurrent.x * canvas.width, dragStart.y * canvas.height);
        ctx.stroke();
      } else {
        ctx.strokeRect(left, top, right - left, bottom - top);
      }

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
  }, [masks, dragStart, dragCurrent, originalImage]);

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
    setDragStart(position);
    setDragCurrent(position);
    setSegmentError(null);
  };

  const handlePointerMove = (e: PointerEvent<HTMLCanvasElement>) => {
    if (!dragStart) return;
    const position = getPointerPosition(e);
    if (!position) return;
    setDragCurrent(position);
  };

  const handlePointerUp = async (e: PointerEvent<HTMLCanvasElement>) => {
    if (!dragStart) return;

    const end = getPointerPosition(e);
    if (!end) {
      setDragStart(null);
      setDragCurrent(null);
      return;
    }

    const start = dragStart;
    setDragStart(null);
    setDragCurrent(null);

    const width = Math.abs(end.x - start.x);
    const height = Math.abs(end.y - start.y);

    // A click is a valid selection too. Turn it into a small selection box
    // around the click so SAM3 receives the same kind of visual prompt as a drag.
    const isClick = Math.max(width, height) < 0.025;
    const clickHalfSize = 0.02;
    const clickX = (start.x + end.x) / 2;
    const clickY = (start.y + end.y) / 2;

    if (activeProduct === 'KNIKARMSCHERMEN') {
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
      return;
    }

    setSegmenting(true);
    setSegmentError(null);
    setSegmentationPreview(null);

    const selection = isClick
      ? {
          left: Math.max(0, clickX - clickHalfSize),
          top: Math.max(0, clickY - clickHalfSize),
          right: Math.min(1, clickX + clickHalfSize),
          bottom: Math.min(1, clickY + clickHalfSize)
        }
      : {
          left: Math.min(start.x, end.x),
          top: Math.min(start.y, end.y),
          right: Math.max(start.x, end.x),
          bottom: Math.max(start.y, end.y)
        };

    try {
      const response = await fetch('/api/segment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: originalImage,
          selection,
          imageWidth: imgRef.current?.naturalWidth ?? null,
          imageHeight: imgRef.current?.naturalHeight ?? null
        })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || 'SAM 3 selectie mislukt.');

      if (data.visualizationUrl) {
        setSegmentationPreview(data.visualizationUrl);
      }

      if (Array.isArray(data.selectedMasks) && data.selectedMasks.length) {
        addMask({
          type: 'RASTER_MASK',
          coordinates: [],
          rasterMasks: data.selectedMasks,
          productType: activeProduct,
          systemColor: activeSystemColor,
          fabricColor: activeFabricColor || undefined
        });
      } else {
        const debugText = data.debugShape
          ? ` SAM3 output-structuur: ${JSON.stringify(data.debugShape).slice(0, 3500)}`
          : '';
        throw new Error('SAM 3 kon geen selectie uit de sleepactie halen.' + debugText);
      }
    } catch (error) {
      setSegmentError(error instanceof Error ? error.message : 'SAM 3 selectie mislukt.');
    } finally {
      setSegmenting(false);
    }
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
        {segmentationPreview && (
          <img
            src={segmentationPreview}
            alt="SAM 3 selectiepreview"
            className="absolute inset-0 w-full h-full object-contain pointer-events-none opacity-0 rounded-sm"
          />
        )}
        <canvas
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={() => {
            setDragStart(null);
            setDragCurrent(null);
          }}
          className={`absolute top-0 left-0 w-full h-full rounded-sm ${activeProduct === 'KNIKARMSCHERMEN' ? 'cursor-crosshair' : 'cursor-pointer'}`}
          style={{ touchAction: 'none' }}
        />
      </div>

      <div className="absolute top-4 left-4 bg-black/80 backdrop-blur-sm text-white px-4 py-2 rounded-md text-sm flex items-center gap-2 shadow-lg">
        <MousePointer2 size={16} className={activeProduct === 'KNIKARMSCHERMEN' ? 'text-blue-400' : 'text-green-400'} />
        {segmenting ? "Selectie wordt door SAM 3 verwerkt…" : segmentError ? segmentError : activeProduct === 'KNIKARMSCHERMEN'
          ? "Sleep over de gewenste breedte van het knikarmscherm."
          : "Sleep over het raam of kozijn dat je wilt selecteren. Meerdere ramen? Sleep over het hele gebied."
        }
      </div>

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