'use client';

import React, { useState } from 'react';
import { WindowSpot } from '@/lib/visualizer';

interface FacadeCanvasProps {
  src: string;
  spots: WindowSpot[];
  activeId: string | null;
  drawingMode: 'point' | 'line';
  onAddSpot: (spot: Omit<WindowSpot, 'id' | 'number' | 'label'>) => void;
  onSelectSpot: (id: string) => void;
  onRemoveSpot: (id: string) => void;
}

export function FacadeCanvas({
  src,
  spots,
  activeId,
  drawingMode,
  onAddSpot,
  onSelectSpot,
}: FacadeCanvasProps) {
  const [lineStart, setLineStart] = useState<{ x: number; y: number } | null>(null);

  const handleImageClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.round(((e.clientX - rect.left) / rect.width) * 100);
    const y = Math.round(((e.clientY - rect.top) / rect.height) * 100);

    if (drawingMode === 'point') {
      onAddSpot({
        type: 'point',
        x,
        y,
        product: 'screen',
        frameColor: '#383E42',
        fabricColor: 'antraciet',
      });
    } else {
      if (!lineStart) {
        setLineStart({ x, y });
      } else {
        onAddSpot({
          type: 'line',
          x: Math.min(lineStart.x, x),
          y: lineStart.y,
          endX: Math.max(lineStart.x, x),
          endY: lineStart.y,
          product: 'knikarmscherm',
          frameColor: '#383E42',
          fabricColor: 'antraciet',
        });
        setLineStart(null);
      }
    }
  };

  return (
    <div className="flex flex-col items-center gap-4 w-full">
      <div 
        className="relative inline-block max-w-full shadow-lg rounded-lg overflow-hidden border border-slate-200 bg-black/5 cursor-crosshair select-none"
        onClick={handleImageClick}
      >
        <img
          src={src}
          alt="Gevel"
          className="object-contain max-h-[70vh] w-auto block pointer-events-none"
        />

        <svg className="absolute inset-0 w-full h-full pointer-events-none">
          {lineStart && (
            <circle
              cx={`${lineStart.x}%`}
              cy={`${lineStart.y}%`}
              r="6"
              className="fill-blue-500 stroke-white stroke-2 animate-pulse"
            />
          )}
          {spots.map((spot) => {
            if (spot.type === 'line' && spot.endX !== undefined && spot.endY !== undefined) {
              const isActive = spot.id === activeId;
              return (
                <g key={spot.id}>
                  <line
                    x1={`${spot.x}%`}
                    y1={`${spot.y}%`}
                    x2={`${spot.endX}%`}
                    y2={`${spot.endY}%`}
                    className={isActive ? 'stroke-blue-600 stroke-[4]' : 'stroke-slate-900/80 stroke-[3]'}
                  />
                  <circle cx={`${spot.x}%`} cy={`${spot.y}%`} r="5" className="fill-blue-600 stroke-white stroke-2" />
                  <circle cx={`${spot.endX}%`} cy={`${spot.endY}%`} r="5" className="fill-blue-600 stroke-white stroke-2" />
                </g>
              );
            }
            return null;
          })}
        </svg>

        {spots.map((spot, index) => {
          if (spot.type === 'point') {
            const isActive = spot.id === activeId;
            return (
              <div
                key={spot.id}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectSpot(spot.id);
                }}
                className={`absolute -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full border-2 flex items-center justify-center text-xs font-bold transition-all shadow-md cursor-pointer ${
                  isActive
                    ? 'bg-blue-600 border-white text-white scale-110 ring-4 ring-blue-400/30'
                    : 'bg-slate-900/80 border-slate-300 text-white hover:scale-105'
                }`}
                style={{ left: `${spot.x}%`, top: `${spot.y}%` }}
                title={`Locatie ${index + 1}`}
              >
                {index + 1}
              </div>
            );
          }
          return null;
        })}
      </div>

      <div className="flex items-center justify-between w-full px-2 text-xs text-muted-foreground">
        <span>
          {drawingMode === 'point' 
            ? '💡 Klik op een raam om een punt toe te voegen.' 
            : lineStart 
              ? '📍 Klik op het eindpunt van het knikarmscherm.' 
              : '📏 Klik op het startpunt van het knikarmscherm op de gevel.'}
        </span>
        <span>{spots.length} locaties geselecteerd</span>
      </div>
    </div>
  );
}