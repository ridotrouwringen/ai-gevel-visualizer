'use client';

import React, { useState } from 'react';

export interface WindowAnchor {
  id: string;
  x: number; // Percentage vanaf links (0-100)
  y: number; // Percentage vanaf boven (0-100)
  selected: boolean;
}

interface FacadeCanvasProps {
  imageSrc: string;
  onWindowsChange: (windows: WindowAnchor[]) => void;
}

export function FacadeCanvas({ imageSrc, onWindowsChange }: FacadeCanvasProps) {
  const [windows, setWindows] = useState<WindowAnchor[]>([]);

  // Vang de klik op en bereken de exacte relatieve positie (percentages) op de foto
  const handleImageClick = (e: React.MouseEvent<HTMLImageElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    const xPercent = (clickX / rect.width) * 100;
    const yPercent = (clickY / rect.height) * 100;

    const newWindow: WindowAnchor = {
      id: `raam-${windows.length + 1}`,
      x: Math.round(xPercent * 100) / 100,
      y: Math.round(yPercent * 100) / 100,
      selected: true,
    };

    const updated = [...windows, newWindow];
    setWindows(updated);
    onWindowsChange(updated);
  };

  const toggleSelect = (id: string) => {
    const updated = windows.map((w) => (w.id === id ? { ...w, selected: !w.selected } : w));
    setWindows(updated);
    onWindowsChange(updated);
  };

  const selectAll = (status: boolean) => {
    const updated = windows.map((w) => ({ ...w, selected: status }));
    setWindows(updated);
    onWindowsChange(updated);
  };

  const removeWindow = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = windows.filter((w) => w.id !== id);
    setWindows(updated);
    onWindowsChange(updated);
  };

  return (
    <div className="flex flex-col items-center gap-4 w-full">
      {/* Snelknoppen voor multi-selectie */}
      {windows.length > 0 && (
        <div className="flex gap-2">
          <button
            onClick={() => selectAll(true)}
            className="px-3 py-1.5 text-xs font-medium bg-slate-200 hover:bg-slate-300 rounded-md transition"
          >
            Selecteer alles
          </button>
          <button
            onClick={() => selectAll(false)}
            className="px-3 py-1.5 text-xs font-medium bg-slate-200 hover:bg-slate-300 rounded-md transition"
          >
            Wis selectie
          </button>
        </div>
      )}

      {/* Canvas / Afbeelding container */}
      <div className="relative inline-block max-w-full shadow-lg rounded-lg overflow-hidden border border-slate-200">
        <img
          src={imageSrc}
          alt="Gevel"
          onClick={handleImageClick}
          className="object-contain max-h-[70vh] w-auto cursor-crosshair block"
        />

        {/* Visuele markers op de geklikte ankerpunten */}
        {windows.map((win, index) => (
          <div
            key={win.id}
            className={`absolute -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full border-2 flex items-center justify-center text-xs font-bold transition-all shadow-md ${
              win.selected
                ? 'bg-blue-600/80 border-white text-white scale-100'
                : 'bg-slate-500/60 border-slate-300 text-slate-200 scale-90'
            }`}
            style={{ left: `${win.x}%`, top: `${win.y}%` }}
            onClick={(e) => {
              e.stopPropagation();
              toggleSelect(win.id);
            }}
            title={`Raam ${index + 1} (Klik om aan/uit te zetten)`}
          >
            {index + 1}
            <button
              onClick={(e) => removeWindow(win.id, e)}
              className="absolute -top-2 -right-2 bg-red-600 text-white rounded-full w-4 h-4 text-[10px] flex items-center justify-center hover:bg-red-700"
            >
              ×
            </button>
          </div>
        ))}
      </div>
      <p className="text-xs text-slate-500">
        Klik op de gevel om een raam aan te wijzen. Klik op het cirkeltje om de selectie te toggelen of te verwijderen.
      </p>
    </div>
  );
}