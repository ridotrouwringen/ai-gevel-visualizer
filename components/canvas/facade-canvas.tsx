"use client";

import { useRef, ChangeEvent, useEffect, useState, MouseEvent } from 'react';
import { useVisualizerStore } from '@/store/visualizer-store';
import { UploadCloud, Trash2, MousePointer2 } from 'lucide-react';
import { SYSTEM_COLORS, ZIPSCREEN_FABRICS, AWNING_FABRICS, ProductType, SystemColor, FabricColor } from '@/types/visualizer';

// Hulpfunctie om de Hex-kleur op te halen aan de hand van het ID
const getColorHex = (id: SystemColor | FabricColor | null) => {
  if (!id) return '#000000';
  const allColors = [...SYSTEM_COLORS, ...ZIPSCREEN_FABRICS, ...AWNING_FABRICS];
  return allColors.find(c => c.id === id)?.hex || '#000000';
};

// Wiskundige hulpfunctie: Kijkt of een X,Y punt binnen een Polygoon valt (Ray-casting algoritme)
const isPointInPolygon = (point: { x: number; y: number }, vs: { x: number; y: number }[]) => {
  let x = point.x, y = point.y;
  let inside = false;
  for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
    let xi = vs[i].x, yi = vs[i].y;
    let xj = vs[j].x, yj = vs[j].y;
    let intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
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

  // State voor het tekenen van lijnen (Knikarmschermen)
  const [lineStart, setLineStart] = useState<{ x: number, y: number } | null>(null);
  const [mousePos, setMousePos] = useState<{ x: number, y: number } | null>(null);

  // Verwerkt de geüploade afbeelding
  const handleImageUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result) setOriginalImage(event.target.result as string);
    };
    reader.readAsDataURL(file);
  };

  // Teken-functie die over de foto heen tekent (wordt uitgevoerd bij elke wijziging in masks of muisbeweging)
  const drawCanvas = () => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Zorg dat de canvas exact zo groot is als de (geschaalde) afbeelding
    canvas.width = img.width;
    canvas.height = img.height;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 1. Teken alle opgeslagen maskers/lijnen
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
        
        // Semi-transparante vulling
        ctx.fillStyle = `${hexColor}66`; // 40% opacity
        ctx.fill();
        // Harde randlijn
        ctx.strokeStyle = hexColor;
        ctx.lineWidth = 2;
        ctx.stroke();

        // Teken Nummer Badge in het midden
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

        // Teken Nummer Badge
        drawBadge(ctx, (startX + endX) / 2, (startY + endY) / 2, mask.sequenceNumber, hexColor);
      }
    });

    // 2. Teken de tijdelijke lijn als we bezig zijn met een Knikarmscherm
    if (lineStart && mousePos) {
      const hexColor = getColorHex(activeFabricColor || activeSystemColor);
      ctx.beginPath();
      ctx.moveTo(lineStart.x * canvas.width, lineStart.y * canvas.height);
      ctx.lineTo(mousePos.x * canvas.width, mousePos.y * canvas.height);
      ctx.strokeStyle = `${hexColor}AA`; // Transparant tijdens het trekken
      ctx.setLineDash([5, 5]); // Gestippeld
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.setLineDash([]); // Reset
    }
  };

  // Helper voor het tekenen van de (1, 2, 3...) bolletjes
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

  // Her-teken canvas bij state of venstergrootte veranderingen
  useEffect(() => {
    drawCanvas();
    window.addEventListener('resize', drawCanvas);
    return () => window.removeEventListener('resize', drawCanvas);
  }, [masks, lineStart, mousePos, originalImage]);

  // Handelt klikken op het canvas af
  const handleCanvasClick = (e: MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Bereken relatieve klik (0.0 tot 1.0) zodat het meeschaalt
    const rect = canvas.getBoundingClientRect();
    const clickX = (e.clientX - rect.left) / canvas.width;
    const clickY = (e.clientY - rect.top) / canvas.height;

    // 1. HIT DETECTION: Hebben we op een bestaand raam/polygoon geklikt?
    // We doorlopen de masks achterstevoren (zodat de bovenste eerst gepakt wordt)
    for (let i = masks.length - 1; i >= 0; i--) {
      const mask = masks[i];
      if (mask.type === 'POLYGON' && isPointInPolygon({ x: clickX, y: clickY }, mask.coordinates)) {
        removeMask(mask.id);
        return; // Stop verdere executie, we hebben alleen gedeselecteerd
      }
    }

    // 2. NIEUWE SELECTIE TOEVOEGEN
    if (activeProduct === 'KNIKARMSCHERMEN') {
      // 2-Point Line Tool logica
      if (!lineStart) {
        setLineStart({ x: clickX, y: clickY });
      } else {
        // We hebben een start én eindpunt: Sla de lijn op
        addMask({
          type: 'LINE',
          coordinates: [lineStart, { x: clickX, y: clickY }],
          productType: activeProduct,
          systemColor: activeSystemColor,
          fabricColor: activeFabricColor || undefined
        });
        setLineStart(null); // Reset lijn status
      }
    } else {
      // Rolluiken / Zipscreens Vlakken Tool
      // TODO: Hier komt in de volgende fase de OpenCV/Edge Detection die het hele kozijn zoekt.
      // Voor nu genereren we een gesimuleerde rechthoek van 10% breed en 15% hoog rondom de klik.
      const width = 0.10;
      const height = 0.15;
      const dummyCoordinates = [
        { x: clickX - width/2, y: clickY - height/2 }, // Links-Boven
        { x: clickX + width/2, y: clickY - height/2 }, // Rechts-Boven
        { x: clickX + width/2, y: clickY + height/2 }, // Rechts-Onder
        { x: clickX - width/2, y: clickY + height/2 }  // Links-Onder
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

  // Muistracking voor de Knikarmscherm lijn preview
  const handleMouseMove = (e: MouseEvent<HTMLCanvasElement>) => {
    if (!lineStart || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    setMousePos({
      x: (e.clientX - rect.left) / canvasRef.current.width,
      y: (e.clientY - rect.top) / canvasRef.current.height,
    });
  };

  if (!originalImage) {
    return (
      <div className="max-w-3xl w-full text-center border-2 border-dashed border-gray-300 rounded-xl p-12 bg-white flex flex-col items-center justify-center shadow-sm">
         <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4 border border-gray-100">
           <UploadCloud className="w-8 h-8 text-gray-500" />
         </div>
         <h3 className="text-lg font-semibold text-gray-900 mb-2">Upload een gevel foto</h3>
         <p className="text-gray-500 mb-6 max-w-md">
           Kies een duidelijke foto van de voor- of achterkant van het huis. Zorg dat de ramen goed zichtbaar zijn.
         </p>
         <input type="file" accept="image/jpeg, image/png, image/webp" className="hidden" ref={fileInputRef} onChange={handleImageUpload} />
         <button onClick={() => fileInputRef.current?.click()} className="bg-white border border-gray-300 text-gray-700 font-medium py-2 px-6 rounded-md hover:bg-gray-50 transition-colors shadow-sm">
           Kies Afbeelding
         </button>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full flex items-center justify-center bg-gray-200 rounded-xl overflow-hidden shadow-inner p-4">
      
      {/* Wrapper zorgt dat canvas exact op de afbeelding ligt, ongeacht de verhouding */}
      <div className="relative inline-block max-w-full max-h-full" ref={containerRef}>
        <img 
          src={originalImage} 
          alt="Gevel" 
          ref={imgRef}
          onLoad={drawCanvas}
          className="block max-w-full max-h-[80vh] object-contain shadow-md rounded-sm"
        />
        
        {/* Interactieve Canvas Laag */}
        <canvas 
          ref={canvasRef}
          onClick={handleCanvasClick}
          onMouseMove={handleMouseMove}
          className={`absolute top-0 left-0 w-full h-full rounded-sm ${activeProduct === 'KNIKARMSCHERMEN' ? 'cursor-crosshair' : 'cursor-pointer'}`}
          style={{ touchAction: 'none' }} // Voorkomt scrollen op mobiel tijdens tekenen
        />
      </div>
      
      {/* Tool Tip Info Bar */}
      <div className="absolute top-4 left-4 bg-black/80 backdrop-blur-sm text-white px-4 py-2 rounded-md text-sm flex items-center gap-2 shadow-lg">
        <MousePointer2 size={16} className={activeProduct === 'KNIKARMSCHERMEN' ? 'text-blue-400' : 'text-green-400'} />
        {activeProduct === 'KNIKARMSCHERMEN' 
          ? lineStart ? "Klik op het eindpunt van de gevel om de lijn te voltooien." : "Klik 2 punten op de muur om de breedte van het knikarmscherm te bepalen."
          : "Klik ergens in het raam/kozijn om het hele element te selecteren. Klik nogmaals om te verwijderen."
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