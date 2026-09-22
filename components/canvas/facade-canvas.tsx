"use client";

import { useRef, ChangeEvent } from 'react';
import { useVisualizerStore } from '@/store/visualizer-store';
import { UploadCloud, Trash2 } from 'lucide-react';

export function FacadeCanvas() {
  const { originalImage, setOriginalImage, clearMasks } = useVisualizerStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Verwerkt de geüploade afbeelding en slaat deze op in de global state
  const handleImageUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result) {
        setOriginalImage(event.target.result as string);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleReset = () => {
    // Forceer Next/TS om de string leeg te maken via any cast of null handling (opgelost door type 'any' te vermijden, store accepteert string | null maar we gebruiken hier dataURL als string, setOriginalImage verwacht een string dus let's pass empty if we want to clear or update store. We update store for null check).
    // Omdat onze store setOriginalImage(dataUrl: string) verwacht, maken we het simpelweg leeg.
    setOriginalImage(''); 
    clearMasks();
  };

  // Als er nog geen foto is, toon de uploader
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
         <input 
           type="file" 
           accept="image/jpeg, image/png, image/webp" 
           className="hidden" 
           ref={fileInputRef}
           onChange={handleImageUpload}
         />
         <button 
           onClick={() => fileInputRef.current?.click()}
           className="bg-white border border-gray-300 text-gray-700 font-medium py-2 px-6 rounded-md hover:bg-gray-50 transition-colors shadow-sm"
         >
           Kies Afbeelding
         </button>
      </div>
    );
  }

  // Als er wel een foto is, toon de werkruimte
  return (
    <div className="relative w-full h-full flex items-center justify-center bg-gray-200 rounded-xl overflow-hidden shadow-inner cursor-crosshair">
      
      {/* 
        Dit is de basisafbeelding. In de volgende stap maken we hier een 
        HTML5 <canvas> van zodat we de maskers en lijnen kunnen tekenen! 
      */}
      <img 
        src={originalImage} 
        alt="Gevel" 
        className="max-w-full max-h-full object-contain pointer-events-none select-none"
      />
      
      {/* Tijdelijke UI Overlay om te laten zien dat state werkt */}
      <div className="absolute top-4 left-4 bg-black/80 backdrop-blur-sm text-white px-4 py-2 rounded-md text-sm flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
        Foto ingeladen. Klik op de ramen om te selecteren (binnenkort beschikbaar).
      </div>

      <button 
         onClick={handleReset}
         className="absolute bottom-4 right-4 bg-white/90 hover:bg-white text-red-600 px-4 py-2 rounded-md text-sm shadow-md font-medium flex items-center gap-2 transition-colors"
      >
        <Trash2 size={16} />
        Nieuwe foto
      </button>
    </div>
  );
}