'use client';

import React from 'react';
import { WindowSpot } from '@/lib/visualizer';

interface FacadeCanvasProps {
  src: string;
  spots: WindowSpot[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
}

export function FacadeCanvas({
  src,
  spots,
  selectedIds,
  onToggle,
  onSelectAll,
  onDeselectAll,
}: FacadeCanvasProps) {
  return (
    <div className="flex flex-col items-center gap-4 w-full">
      {spots.length > 0 && (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onSelectAll}
            className="px-3 py-1.5 text-xs font-medium bg-slate-200 hover:bg-slate-300 rounded-md transition cursor-pointer"
          >
            Selecteer alles
          </button>
          <button
            type="button"
            onClick={onDeselectAll}
            className="px-3 py-1.5 text-xs font-medium bg-slate-200 hover:bg-slate-300 rounded-md transition cursor-pointer"
          >
            Wis selectie
          </button>
        </div>
      )}

      <div className="relative inline-block max-w-full shadow-lg rounded-lg overflow-hidden border border-slate-200 bg-black/5">
        <img
          src={src}
          alt="Gevel"
          className="object-contain max-h-[70vh] w-auto block select-none"
        />

        {spots.map((spot) => {
          const isSelected = selectedIds.includes(spot.id);
          return (
            <div
              key={spot.id}
              onClick={() => onToggle(spot.id)}
              className={`absolute -translate-x-1/2 -translate-y-1/2 px-3 py-1.5 rounded-lg border-2 flex items-center gap-2 text-xs font-bold transition-all shadow-md cursor-pointer ${
                isSelected
                  ? 'bg-blue-600/90 border-white text-white scale-100'
                  : 'bg-slate-800/70 border-slate-400 text-slate-300 scale-95'
              }`}
              style={{ left: `${spot.x}%`, top: `${spot.y}%` }}
              title={`Klik om ${spot.label} aan/uit te zetten`}
            >
              <span>{spot.label}</span>
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => {}}
                className="pointer-events-none h-3.5 w-3.5 rounded border-white text-blue-600 focus:ring-0"
              />
            </div>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground text-center">
        Klik op een raamlabel op de foto om deze te selecteren of te deselecteren voor de AI-montage.
      </p>
    </div>
  );
}