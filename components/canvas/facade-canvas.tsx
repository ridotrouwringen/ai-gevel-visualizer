"use client";

import { useRef, ChangeEvent, useEffect, useState, MouseEvent } from 'react';
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

  const [lineStart, setLineStart] = useState<{ x: number, y: number } | null>(null);
  const [mousePos, setMousePos] = useState<{ x: number, y: number } | null>(null);

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

    // FIX: Gebruik de exacte schermpixels in plaats van originele afbeeldingresolutie
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.lineCap = 'round'; // Zorgt voor mooie ronde uiteinden aan de lijnen

    masks.forEach((mask) => {
      const hexColor = getColorHex(mask.fabricColor || mask.systemColor);
      
      if (mask.type === 'POLYGON') {
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

    if (lineStart && mousePos) {
      const hexColor = getColorHex(activeFabricColor || activeSystemColor);
      ctx.beginPath();
      ctx.moveTo(lineStart.x * canvas.width, lineStart.y * canvas.height);
      ctx.lineTo(mousePos.x * canvas.width, mousePos.y * canvas.height);
      ctx.strokeStyle = `${hexColor}AA`;
      ctx.setLineDash([5, 5]);
      ctx.lineWidth = 3;
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
  }, [masks, lineStart, mousePos, originalImage]);

  const handleCanvasClick = (e: MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const pixelX = e.clientX - rect.left;
    const pixelY = e.clientY - rect.top;
    
    // FIX: Bereken relatieve posities op basis van scherm element, niet interne canvas width
    const clickX = pixelX / rect.width;
    const clickY = pixelY / rect.height;

    for (let i = masks.length - 1; i >= 0; i--) {
      const mask = masks[i];
      if (mask.type === 'POLYGON') {
        const pixelCoords = mask.coordinates.map(c => ({ x: c.x * rect.width, y: c.y * rect.height }));
        if (isPointInPolygon({ x: pixelX, y: pixelY }, pixelCoords)) {
          removeMask(mask.id);
          return;
        }
      } else if (mask.type === 'LINE' && mask.coordinates.length === 2) {
        const p1 = { x: mask.coordinates[0].x * rect.width, y: mask.coordinates[0].y * rect.height };
        const p2 = { x: mask.coordinates[1].x * rect.width, y: mask.coordinates[1].y * rect.height };
        if (isPointNearLine(pixelX, pixelY, p1.x, p1.y, p2.x, p2.y, 15)) {
          removeMask(mask.id);
          return;
        }
      }
    }

    if (activeProduct === 'KNIKARMSCHERMEN') {
      if (!lineStart) {
        setLineStart({ x: clickX, y: clickY });
      } else {
        addMask({
          type: 'LINE',
          coordinates: [lineStart, { x: clickX, y: clickY }],
          productType: activeProduct,
          systemColor: activeSystemColor,
          fabricColor: activeFabricColor || undefined
        });
        setLineStart(null);
      }
    } else {
      const width = 0.05;
      const height = 0.05;
      const dummyCoordinates = [
        { x: clickX - width/2, y: clickY - height/2 },
        { x: clickX + width/2, y: clickY - height/2 },
        { x: clickX + width/2, y: clickY + height/2 },
        { x: clickX - width/2, y: clickY + height/2 }
      ];

      addMask({
        type: 'POLYGON',
        coordinates: dummyCoordinates,
        productType: activeProduct,
        systemColor: activeSystemColor,
        fabricColor: activeFabricColor || undefined
      });
    }
  };

  const handleMouseMove = (e: MouseEvent<HTMLCanvasElement>) => {
    if (!lineStart || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    
    // FIX: Muistracking nu ook op basis van schermbreedte
    setMousePos({
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top) / rect.height,
    });
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
          onClick={handleCanvasClick}
          onMouseMove={handleMouseMove}
          className={`absolute top-0 left-0 w-full h-full rounded-sm ${activeProduct === 'KNIKARMSCHERMEN' ? 'cursor-crosshair' : 'cursor-pointer'}`}
          style={{ touchAction: 'none' }}
        />
      </div>
      
      <div className="absolute top-4 left-4 bg-black/80 backdrop-blur-sm text-white px-4 py-2 rounded-md text-sm flex items-center gap-2 shadow-lg">
        <MousePointer2 size={16} className={activeProduct === 'KNIKARMSCHERMEN' ? 'text-blue-400' : 'text-green-400'} />
        {activeProduct === 'KNIKARMSCHERMEN' 
          ? lineStart ? "Klik op het eindpunt van de gevel om de lijn te voltooien." : "Klik 2 punten op de muur om de breedte van het knikarmscherm te bepalen."
          : "Klik op een raam om deze te markeren voor de AI-detectie. Klik nogmaals om te verwijderen."
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