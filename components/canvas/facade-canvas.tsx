"use client";

import { useRef, ChangeEvent, useEffect, useState, PointerEvent } from 'react';
import { useVisualizerStore } from '@/store/visualizer-store';
import { UploadCloud, Trash2, Crosshair, ZoomIn, ZoomOut, Hand, Maximize } from 'lucide-react';
import { SYSTEM_COLORS, ZIPSCREEN_FABRICS, AWNING_FABRICS, ProductType, SystemColor, FabricColor } from '@/types/visualizer';

import { prepareFacadePhoto } from '@/lib/photo-upload';
import { useSelectionPerspective, PerspectiveCheckOverlay, PerspectiveCheckPanel } from './selection-perspective';

import { FIT_PHOTO, MAX_PHOTO_ZOOM, constrainPhotoView, zoomPhotoAt, photoPointFromClient, type PhotoView } from '@/lib/photo-viewport';

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
    activeProduct, activeSystemColor, activeFabricColor, selectedMaskId, selectMask, updateMask,
    activeMountingMode: mountingMode, setActiveMountingMode: setMountingMode
  } = useVisualizerStore();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  const [dragStart, setDragStart] = useState<{ x: number, y: number } | null>(null);
  const [dragCurrent, setDragCurrent] = useState<{ x: number, y: number } | null>(null);
  const [polygonPoints, setPolygonPoints] = useState<{ x: number, y: number }[]>([]);
  const [polygonPreviewPoint, setPolygonPreviewPoint] = useState<{ x: number, y: number } | null>(null);
  const [segmentError, setSegmentError] = useState<string | null>(null);
  // Debug view: this is the exact raster mask stored in Zustand and sent
  // unchanged to /api/replicate as selection.rasterMasks.
  const [showGenerationMask, setShowGenerationMask] = useState(true);
  const [showPerspective,setShowPerspective]=useState(true);
  const [view, setView] = useState<PhotoView>(FIT_PHOTO);
  const [panMode, setPanMode] = useState(false);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const panStart = useRef<{ id: number; x: number; y: number; view: PhotoView } | null>(null);
  const touches = useRef(new Map<number, {x:number;y:number}>());
  const pendingTouch = useRef<number | null>(null);
  const pinch = useRef<{distance:number;center:{x:number;y:number};view:PhotoView} | null>(null);
  const cornerDrag = useRef<{id:string,index:number} | null>(null);

  const [isPreparingPhoto, setIsPreparingPhoto] = useState(false);
  const [photoNotice, setPhotoNotice] = useState<string | null>(null);
  const uploadRequest = useRef(0);
  const completeSelections=masks.filter(mask=>mask.coordinates.length===4);
  const perspectiveSelection=polygonPoints.length===0&&activeProduct!=='KNIKARMSCHERMEN'
    ?completeSelections.find(mask=>mask.id===selectedMaskId)??completeSelections[completeSelections.length-1]
    :undefined;
  const perspective=useSelectionPerspective(originalImage,perspectiveSelection?.coordinates,showPerspective);

  const handleImageUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const request = ++uploadRequest.current;
    setSegmentError(null);
    setIsPreparingPhoto(true);
    try {
      const photo = await prepareFacadePhoto(file);
      if (request !== uploadRequest.current) return;
      setPhotoNotice(photo.optimized ? 'Foto automatisch verkleind voor de visualisatie.' : null);
      // All points and raster masks will be created on this exact work image.
      setOriginalImage(photo.dataUrl);
    } catch (error) {
      if (request === uploadRequest.current) setSegmentError(error instanceof Error ? error.message : 'De foto kon niet worden voorbereid.');
    } finally {
      if (request === uploadRequest.current) setIsPreparingPhoto(false);
    }
  };

  const drawCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = { width: canvas.clientWidth, height: canvas.clientHeight };
    // The image may not have dimensions yet when returning from the result.
    // onLoad redraws once it is decoded; drawing a zero-sized canvas throws.
    if (rect.width < 1 || rect.height < 1) return;
    const drawWidth = rect.width, drawHeight = rect.height;
    const resolution = Math.min((window.devicePixelRatio || 1) * view.scale, 4, Math.sqrt(16_000_000 / (drawWidth * drawHeight)));
    canvas.width = Math.round(drawWidth * resolution);
    canvas.height = Math.round(drawHeight * resolution);
    ctx.setTransform(canvas.width / drawWidth, 0, 0, canvas.height / drawHeight, 0, 0);

    ctx.clearRect(0, 0, drawWidth, drawHeight);
    ctx.lineCap = 'round';
    ctx.font = `${12 / view.scale}px Arial`;

    const imageWidth = imgRef.current?.naturalWidth || drawWidth;
    const imageHeight = imgRef.current?.naturalHeight || drawHeight;

    masks.forEach((mask) => {
      const hexColor = getColorHex(mask.fabricColor || mask.systemColor);

      if (mask.type === 'RASTER_MASK' && mask.rasterMasks?.length) {
        const maskCanvas = document.createElement('canvas');
        maskCanvas.width = drawWidth;
        maskCanvas.height = drawHeight;
        const maskCtx = maskCanvas.getContext('2d');
        if (maskCtx) {
          const imageWidth = imgRef.current?.naturalWidth || drawWidth;
          const imageHeight = imgRef.current?.naturalHeight || drawHeight;
          const imageScaleX = drawWidth / imageWidth;
          const imageScaleY = drawHeight / imageHeight;
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
        const midX = drawWidth * 0.5;
        const midY = drawHeight * 0.5;
        drawBadge(ctx, midX, midY, mask.sequenceNumber, hexColor);
      }

      else if (mask.type === 'POLYGON') {
        ctx.beginPath();
        mask.coordinates.forEach((coord, i) => {
          const x = coord.x * drawWidth;
          const y = coord.y * drawHeight;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.closePath();

        ctx.fillStyle = `${hexColor}66`;
        ctx.fill();
        ctx.strokeStyle = hexColor;
        ctx.lineWidth = 2 / view.scale;
        ctx.stroke();

        const midX = mask.coordinates.reduce((sum, c) => sum + c.x, 0) / mask.coordinates.length * drawWidth;
        const midY = mask.coordinates.reduce((sum, c) => sum + c.y, 0) / mask.coordinates.length * drawHeight;
        drawBadge(ctx, midX, midY, mask.sequenceNumber, hexColor);
      }

      else if (mask.type === 'LINE' && mask.coordinates.length === 2) {
        const startX = mask.coordinates[0].x * drawWidth;
        const startY = mask.coordinates[0].y * drawHeight;
        const endX = mask.coordinates[1].x * drawWidth;
        const endY = mask.coordinates[1].y * drawHeight;

        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(endX, endY);
        ctx.strokeStyle = hexColor;
        ctx.lineWidth = 4 / view.scale;
        ctx.stroke();

        drawBadge(ctx, (startX + endX) / 2, (startY + endY) / 2, mask.sequenceNumber, hexColor);
      }
    });

    masks.filter(m=>m.coordinates.length===4).forEach(mask=> {
      mask.coordinates.forEach((point,index)=> {
        const x=point.x*drawWidth,y=point.y*drawHeight;
        ctx.beginPath();ctx.arc(x,y,5 / view.scale,0,Math.PI*2);
        ctx.fillStyle=mask.id===selectedMaskId?'#facc15':'white';ctx.fill();
        ctx.strokeStyle='#111827';ctx.lineWidth=1 / view.scale;ctx.stroke();
        if(mask.id===selectedMaskId){ctx.fillStyle='#111827';ctx.fillText(`P${index+1}`,x+8 / view.scale,y-8 / view.scale);}
      });
    });

    if (polygonPoints.length > 0 && activeProduct !== 'KNIKARMSCHERMEN') {
      const hexColor = getColorHex(activeFabricColor || activeSystemColor);
      ctx.save();
      ctx.strokeStyle = hexColor;
      ctx.fillStyle = `${hexColor}22`;
      ctx.lineWidth = 3 / view.scale;
      ctx.setLineDash([7, 5]);
      ctx.beginPath();
      polygonPoints.forEach((point, index) => {
        const x = point.x * drawWidth;
        const y = point.y * drawHeight;
        if (index === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      if (polygonPoints.length === 4) ctx.closePath();
      ctx.stroke();
      if (polygonPoints.length === 4) ctx.fill();

      // Live guide: after each corner click, show exactly where the next
      // straight edge will be drawn. After 4 points, show the closing edge
      // back to point 1 so perspective alignment can be checked before
      // committing the mask.
      if (polygonPreviewPoint && polygonPoints.length < 4) {
        const last = polygonPoints[polygonPoints.length - 1];
        ctx.beginPath();
        ctx.moveTo(last.x * drawWidth, last.y * drawHeight);
        ctx.lineTo(polygonPreviewPoint.x * drawWidth, polygonPreviewPoint.y * drawHeight);
        ctx.strokeStyle = '#39FF14';
        ctx.lineWidth = 3 / view.scale;
        ctx.setLineDash([5, 5]);
        ctx.stroke();
        ctx.setLineDash([]);
      } else if (polygonPoints.length === 4) {
        const first = polygonPoints[0];
        const last = polygonPoints[3];
        ctx.beginPath();
        ctx.moveTo(last.x * drawWidth, last.y * drawHeight);
        ctx.lineTo(first.x * drawWidth, first.y * drawHeight);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2 / view.scale;
        ctx.setLineDash([5, 5]);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      polygonPoints.forEach((point, index) => {
        const x = point.x * drawWidth;
        const y = point.y * drawHeight;
        ctx.beginPath();
        ctx.arc(x, y, 7 / view.scale, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.strokeStyle = hexColor;
        ctx.lineWidth = 3 / view.scale;
        ctx.stroke();
        ctx.fillStyle = hexColor;
        ctx.font = `bold ${12 / view.scale}px Arial`;
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
      ctx.lineWidth = 3 / view.scale;
      ctx.beginPath();
      ctx.moveTo(dragStart.x * drawWidth, dragStart.y * drawHeight);
      ctx.lineTo(dragCurrent.x * drawWidth, dragCurrent.y * drawHeight);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  };

  const drawBadge = (ctx: CanvasRenderingContext2D, x: number, y: number, text: number, color: string) => {
    ctx.beginPath();
    ctx.arc(x, y, 12 / view.scale, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#FFFFFF';
    ctx.font = `bold ${14 / view.scale}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text.toString(), x, y);
  };

  useEffect(() => {
    drawCanvas();
    window.addEventListener('resize', drawCanvas);
    return () => window.removeEventListener('resize', drawCanvas);
  }, [masks, polygonPoints, polygonPreviewPoint, dragStart, dragCurrent, originalImage, showGenerationMask, mountingMode, selectedMaskId, view.scale]);

  useEffect(() => {
    setView(FIT_PHOTO);
    setPanMode(false);
    setPolygonPoints([]);
    setPolygonPreviewPoint(null);
  }, [originalImage]);

  useEffect(() => {
    const frame = containerRef.current;
    if (!frame) return;
    const observer = new ResizeObserver(() => {
      setView(FIT_PHOTO);
      drawCanvas();
    });
    observer.observe(frame);
    return () => observer.disconnect();
  }, [originalImage]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || (event.target instanceof HTMLElement &&
        (event.target.matches('input, textarea, select, button') || event.target.isContentEditable))) return;
      event.preventDefault();
      setSpaceHeld(event.type === 'keydown');
    };
    const release = () => { setSpaceHeld(false); panStart.current = null; };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);
    window.addEventListener('blur', release);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('keyup', onKey); window.removeEventListener('blur', release); };
  }, []);

  useEffect(() => {
    const frame = containerRef.current;
    if (!frame) return;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = frame.getBoundingClientRect();
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? rect.height : 1;
      const factor = Math.exp(-event.deltaY * unit * (event.ctrlKey ? 0.01 : 0.002));
      setView(current => zoomPhotoAt(current, current.scale * factor,
        {x:event.clientX-rect.left,y:event.clientY-rect.top},rect.width,rect.height));
    };
    frame.addEventListener('wheel', wheel, {passive:false});
    return () => frame.removeEventListener('wheel', wheel);
  }, [originalImage]);

  const zoomWithButton = (factor: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (rect) setView(current => zoomPhotoAt(current, current.scale * factor,
      {x:rect.width/2,y:rect.height/2},rect.width,rect.height));
  };

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

    return photoPointFromClient({x:e.clientX,y:e.clientY},rect);
  };

  const handlePointerDown = (e: PointerEvent<HTMLCanvasElement>) => {
    const position = getPointerPosition(e);
    if (!position) return;
    setSegmentError(null);

    if (polygonPoints.length === 0) {
      const rect=e.currentTarget.getBoundingClientRect();
      for(const mask of [...masks].reverse()) {
        if(mask.coordinates.length!==4) continue;
        const index=mask.coordinates.findIndex(p=>Math.hypot((p.x-position.x)*rect.width,(p.y-position.y)*rect.height)<10);
        if(index>=0){selectMask(mask.id);cornerDrag.current={id:mask.id,index};return;}
      }
      selectMask(null);
    }
    if (activeProduct === 'KNIKARMSCHERMEN') {
      setDragStart(position);
      setDragCurrent(position);
      return;
    }

    const nextPoints = [...polygonPoints, position];
    setPolygonPreviewPoint(null);
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
    const position = getPointerPosition(e);
    if (!position) return;

    if (cornerDrag.current) {
      const {id,index}=cornerDrag.current;
      const mask=masks.find(m=>m.id===id);
      const w=imgRef.current?.naturalWidth,h=imgRef.current?.naturalHeight;
      if(mask && w && h){
        const coordinates=mask.coordinates.map((p,i)=>i===index?position:p);
        updateMask(id,{coordinates,rasterMasks:[buildPolygonRasterMask(coordinates,w,h)]});
      }
      return;
    }
    if (activeProduct === 'KNIKARMSCHERMEN') {
      if (!dragStart) return;
      setDragCurrent(position);
      return;
    }

    if (polygonPoints.length > 0 && polygonPoints.length < 4) {
      setPolygonPreviewPoint(position);
    }
  };

  const handlePointerUp = async (e: PointerEvent<HTMLCanvasElement>) => {
    if (cornerDrag.current) { cornerDrag.current=null; return; }
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

  const onPointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    if (event.button !== 0 && event.button !== 1) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    if (event.pointerType === 'touch') {
      touches.current.set(event.pointerId,{x:event.clientX,y:event.clientY});
      if (touches.current.size === 2) {
        const [a,b] = [...touches.current.values()];
        pinch.current={distance:Math.max(1,Math.hypot(a.x-b.x,a.y-b.y)),center:{x:(a.x+b.x)/2,y:(a.y+b.y)/2},view};
        pendingTouch.current=null;cornerDrag.current=null;panStart.current=null;
        setDragStart(null);setDragCurrent(null);setPolygonPreviewPoint(null);
        return;
      }
      if (touches.current.size > 2) return;
    }
    if (panMode || spaceHeld || event.button === 1) {
      event.preventDefault();
      panStart.current={id:event.pointerId,x:event.clientX,y:event.clientY,view};
      return;
    }
    if (event.pointerType === 'touch' && activeProduct !== 'KNIKARMSCHERMEN') {
      const position=getPointerPosition(event),rect=event.currentTarget.getBoundingClientRect();
      const nearCorner=polygonPoints.length===0 && position && masks.some(mask=>mask.coordinates.length===4 &&
        mask.coordinates.some(p=>Math.hypot((p.x-position.x)*rect.width,(p.y-position.y)*rect.height)<10));
      if (!nearCorner) {pendingTouch.current=event.pointerId;return;}
    }
    handlePointerDown(event);
  };

  const onPointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    if (event.pointerType === 'touch' && touches.current.has(event.pointerId))
      touches.current.set(event.pointerId,{x:event.clientX,y:event.clientY});
    const frame=containerRef.current?.getBoundingClientRect();
    if (pinch.current && touches.current.size>=2 && frame) {
      const [a,b]=[...touches.current.values()],start=pinch.current;
      const center={x:(a.x+b.x)/2,y:(a.y+b.y)/2};
      const next=zoomPhotoAt(start.view,start.view.scale*Math.hypot(a.x-b.x,a.y-b.y)/start.distance,
        {x:start.center.x-frame.left,y:start.center.y-frame.top},frame.width,frame.height);
      setView(constrainPhotoView({...next,x:next.x+center.x-start.center.x,y:next.y+center.y-start.center.y},frame.width,frame.height));
      return;
    }
    if (panStart.current && frame) {
      const start=panStart.current;
      if(start.id===event.pointerId)setView(constrainPhotoView({...start.view,x:start.view.x+event.clientX-start.x,y:start.view.y+event.clientY-start.y},frame.width,frame.height));
      return;
    }
    if (pendingTouch.current!==null || panMode || spaceHeld) return;
    handlePointerMove(event);
  };

  const onPointerUp = (event: PointerEvent<HTMLCanvasElement>) => {
    const wasPinch=pinch.current!==null;
    touches.current.delete(event.pointerId);
    if (wasPinch) {
      if (touches.current.size===0)pinch.current=null;
    } else if (panStart.current) {
      if(panStart.current.id===event.pointerId)panStart.current=null;
    } else {
      if(pendingTouch.current===event.pointerId)handlePointerDown(event);
      void handlePointerUp(event);
    }
    pendingTouch.current=null;
    if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const cancelPointer = () => {
    cornerDrag.current=null;panStart.current=null;pendingTouch.current=null;pinch.current=null;touches.current.clear();
    setDragStart(null);setDragCurrent(null);
  };

  const resetPolygonSelection = () => {
    setPolygonPoints([]);
    setPolygonPreviewPoint(null);
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
         <p className="mt-2 text-sm text-gray-500" role="status">{isPreparingPhoto ? 'Grote foto wordt automatisch geschikt gemaakt…' : 'Grote foto’s worden automatisch verkleind.'}</p>
         {segmentError && <p role="alert" className="mt-3 text-sm text-red-700">{segmentError}</p>}
         <input type="file" accept="image/jpeg, image/png, image/webp" className="hidden" ref={fileInputRef} onChange={handleImageUpload} />
         <button disabled={isPreparingPhoto}
            onClick={() => fileInputRef.current?.click()} className="bg-white border border-gray-300 text-gray-700 font-medium py-2 px-6 rounded-md hover:bg-gray-50 transition-colors shadow-sm">
           {isPreparingPhoto ? 'Foto voorbereiden…' : 'Kies Afbeelding'}
         </button>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full flex items-center justify-center bg-gray-200 rounded-xl overflow-hidden shadow-inner p-4">
      <div className="relative inline-block max-w-full max-h-full" ref={containerRef}>
        <div style={{transform:`translate(${view.x}px, ${view.y}px) scale(${view.scale})`,transformOrigin:'0 0'}}>
        <img
          src={originalImage}
          alt="Gevel"
          ref={imgRef}
          onLoad={drawCanvas}
          className="block max-w-full max-h-[80vh] object-contain shadow-md rounded-sm"
        />
        <canvas
          ref={canvasRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={cancelPointer}
          aria-label="Kozijnhoeken aanwijzen"
          className={`absolute top-0 left-0 w-full h-full rounded-sm ${panMode || spaceHeld ? 'cursor-grab' : 'cursor-crosshair'}`}
          style={{ touchAction: 'none' }}
        />
        <PerspectiveCheckOverlay result={perspective.result}/>
        </div>
      </div>

      {activeProduct!=='KNIKARMSCHERMEN'&&<PerspectiveCheckPanel
        enabled={showPerspective} onToggle={()=>setShowPerspective(v=>!v)}
        hasSelection={!!perspectiveSelection} sequence={perspectiveSelection?.sequenceNumber}
        state={perspective.state} onRetry={perspective.retry}/>
      }

      {masks.some((mask) => mask.type === 'RASTER_MASK' && mask.rasterMasks?.length) && (
        <button
          type="button"
          onClick={() => setShowGenerationMask((visible) => !visible)}
          className="absolute top-4 right-4 z-20 bg-fuchsia-600/95 hover:bg-fuchsia-700 text-white px-4 py-2 rounded-md text-sm shadow-lg font-semibold border border-white/30"
        >
          {showGenerationMask ? 'Mask verbergen' : 'Kozijnselecties tonen'}
        </button>
      )}


      <div className="absolute top-16 right-4 z-20 bg-white/95 text-gray-900 rounded-lg shadow-lg border p-2 flex gap-1">
          <span className="text-xs font-semibold px-2 py-2">Montage</span>
          <button type="button" onClick={() => setMountingMode('IN_DE_DAG')} className={`px-3 py-1.5 rounded text-xs font-medium ${mountingMode === 'IN_DE_DAG' ? 'bg-green-600 text-white' : 'bg-gray-100'}`}>In de dag</button>
          <button type="button" onClick={() => setMountingMode('OP_DE_DAG')} className={`px-3 py-1.5 rounded text-xs font-medium ${mountingMode === 'OP_DE_DAG' ? 'bg-green-600 text-white' : 'bg-gray-100'}`}>Op de dag</button>
        </div>


      {showGenerationMask && masks.some((mask) => mask.type === 'RASTER_MASK' && mask.rasterMasks?.length) && (
        <div className="absolute bottom-20 left-4 z-20 pointer-events-none bg-fuchsia-600/95 text-white px-4 py-2 rounded-md text-xs shadow-lg font-medium">
          Kozijncontour — opbouw kan erbuiten vallen
        </div>
      )}

      <div className="absolute top-4 left-4 max-w-[55%] pointer-events-none bg-black/80 backdrop-blur-sm text-white px-4 py-2 rounded-md text-sm flex items-center gap-2 shadow-lg">
        <Crosshair size={16} className={activeProduct === 'KNIKARMSCHERMEN' ? 'text-blue-400' : 'text-green-400'} />
        {segmentError ? segmentError : activeProduct === 'KNIKARMSCHERMEN'
          ? "Sleep over de gewenste breedte van het knikarmscherm."
          : panMode || spaceHeld ? "Sleep de foto. Kies Aanwijzen om hoekpunten te plaatsen." : "Klik 4 kozijnhoeken. Zoom voor precisie; spatie + slepen verschuift de foto."
        }
      </div>

      {activeProduct !== 'KNIKARMSCHERMEN' && polygonPoints.length > 0 && (
        <button type="button" onClick={resetPolygonSelection} className="absolute top-16 left-4 z-20 bg-white/95 hover:bg-white text-gray-800 px-4 py-2 rounded-md text-sm shadow-lg font-semibold border">
          Opnieuw ({polygonPoints.length}/4)
        </button>
      )}

      <div role="toolbar" aria-label="Foto zoomen en verschuiven" className="absolute bottom-4 left-4 z-20 flex flex-wrap items-center gap-1 rounded-lg border bg-white/95 p-1.5 shadow-lg text-gray-900 text-sm">
        <button type="button" aria-label="Uitzoomen" title="Uitzoomen" disabled={view.scale<=1} onClick={()=>zoomWithButton(1/1.4)} className="p-2 rounded hover:bg-gray-100 disabled:opacity-40"><ZoomOut size={18}/></button>
        <output aria-label="Zoomniveau" className="min-w-12 text-center tabular-nums">{Math.round(view.scale*100)}%</output>
        <button type="button" aria-label="Inzoomen" title="Inzoomen" disabled={view.scale>=MAX_PHOTO_ZOOM} onClick={()=>zoomWithButton(1.4)} className="p-2 rounded hover:bg-gray-100 disabled:opacity-40"><ZoomIn size={18}/></button>
        <button type="button" aria-pressed={panMode} onClick={()=>setPanMode(current=>!current)} className={`flex items-center gap-1 p-2 rounded ${panMode?'bg-blue-600 text-white':'hover:bg-gray-100'}`}><Hand size={16}/>{panMode?'Aanwijzen':'Verschuiven'}</button>
        <button type="button" onClick={()=>setView(FIT_PHOTO)} className="flex items-center gap-1 p-2 rounded hover:bg-gray-100"><Maximize size={16}/>Hele foto tonen</button>
      </div>

      {photoNotice && <p role="status" className="absolute bottom-20 left-4 max-w-[60%] rounded bg-white/90 px-3 py-2 text-xs text-gray-600 pointer-events-none">{photoNotice}</p>}
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
