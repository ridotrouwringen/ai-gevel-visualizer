"use client";

import { useState } from 'react';
import { ProductSelector } from '@/components/configurator/product-selector';
import { FacadeCanvas } from '@/components/canvas/facade-canvas';
import { useVisualizerStore } from '@/store/visualizer-store';
import { Toaster, toast } from 'sonner';
import { Loader2 } from 'lucide-react';

export default function Home() {
  const { originalImage, masks } = useVisualizerStore();
  const [isGenerating, setIsGenerating] = useState(false);

  const handleGenerate = async () => {
    if (!originalImage) {
      toast.error("Upload eerst een gevel foto!");
      return;
    }

    if (masks.length === 0) {
      toast.error("Teken minstens één product op de gevel (klik op een raam of trek een lijn).");
      return;
    }

    setIsGenerating(true);

    const payload = {
      image: originalImage,
      selections: masks.map(mask => ({
        id: mask.id,
        productType: mask.productType,
        systemColor: mask.systemColor,
        fabricColor: mask.fabricColor,
        type: mask.type,
        coordinates: mask.coordinates
      }))
    };

    try {
      // HIER KOPPELEN WE DE VOORKANT AAN JOUW NIEUWE ACHTERKANT
      const response = await fetch('/api/replicate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        // Als de server een foutmelding geeft (bijv. API key ontbreekt), gooi een error
        throw new Error(data.error || "Er is een onbekende fout opgetreden");
      }

      // Succes!
      toast.success(data.message || "Succesvol naar de server gestuurd!");
      
    } catch (error: any) {
      console.error("Fout bij genereren:", error);
      toast.error(error.message || "Kan de server niet bereiken.");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <main className="flex h-screen w-full bg-gray-50 overflow-hidden font-sans">
      <Toaster position="top-center" richColors />

      <aside className="w-96 h-full flex-shrink-0 shadow-lg z-10 relative">
        <ProductSelector />
      </aside>

      <section className="flex-1 h-full relative flex flex-col">
        
        <header className="h-16 bg-white border-b border-gray-200 flex items-center px-6 justify-between flex-shrink-0 z-10">
          <h1 className="text-xl font-bold text-gray-800">AI-Zonwering Visualizer</h1>
          
          <button 
            onClick={handleGenerate}
            disabled={isGenerating || !originalImage}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-all shadow-sm flex items-center gap-2
              ${(isGenerating || !originalImage) 
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed' 
                : 'bg-blue-600 text-white hover:bg-blue-700 hover:scale-105 active:scale-95'
              }`}
          >
            {isGenerating && <Loader2 size={16} className="animate-spin" />}
            {isGenerating ? 'Visualisatie berekenen...' : 'Genereer Visualisatie'}
          </button>
        </header>

        <div className="flex-1 p-6 relative flex items-center justify-center bg-gray-100 overflow-auto">
          <FacadeCanvas />
        </div>

      </section>
    </main>
  );
}