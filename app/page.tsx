"use client";

import { useState } from 'react';
import { ProductSelector } from '@/components/configurator/product-selector';
import { FacadeCanvas } from '@/components/canvas/facade-canvas';
import { useVisualizerStore } from '@/store/visualizer-store';
import { Toaster, toast } from 'sonner';
import { Loader2, RotateCcw } from 'lucide-react';

export default function Home() {
  const { originalImage, generatedImage, setGeneratedImage, masks, setOriginalImage, clearMasks } = useVisualizerStore();
  const [isGenerating, setIsGenerating] = useState(false);

  const handleGenerate = async () => {
    if (!originalImage) {
      toast.error("Upload eerst een gevel foto!");
      return;
    }

    if (masks.length === 0) {
      toast.error("Teken minstens één product op de gevel voordat je genereert.");
      return;
    }

    setIsGenerating(true);
    toast.info("AI is gestart met genereren. Dit kan 10 tot 15 seconden duren...", { duration: 5000 });

    const payload = {
      image: originalImage,
      selections: masks.map(mask => ({
        id: mask.id,
        productType: mask.productType,
        systemColor: mask.systemColor,
        fabricColor: mask.fabricColor,
        type: mask.type,
        coordinates: mask.coordinates,
        rasterMasks: mask.rasterMasks
      }))
    };

    try {
      const response = await fetch('/api/replicate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Er is een fout opgetreden bij de AI.");
      }

      // Sla de gegenereerde foto op in de global state zodat we hem kunnen tonen
      if (data.imageUrl) {
        setGeneratedImage(data.imageUrl);
        toast.success("Visualisatie succesvol gegenereerd!");
      } else {
        throw new Error("Geen afbeelding URL ontvangen van de server.");
      }
      
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
          
          <div className="flex items-center gap-3">
            {generatedImage && (
              <button 
                onClick={() => setGeneratedImage(null)}
                className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-1.5"
              >
                <RotateCcw size={16} />
                Origineel tonen
              </button>
            )}

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
              {isGenerating ? 'AI berekent foto...' : 'Genereer Visualisatie'}
            </button>
          </div>
        </header>

        <div className="flex-1 p-6 relative flex items-center justify-center bg-gray-100 overflow-auto">
          {generatedImage ? (
            // Als de AI klaar is tonen we het resultaat
            <div className="relative w-full h-full flex items-center justify-center bg-gray-200 rounded-xl overflow-hidden shadow-inner p-4">
              <img 
                src={generatedImage} 
                alt="AI Resultaat Zonwering" 
                className="max-w-full max-h-[80vh] object-contain shadow-md rounded-sm"
              />
              <div className="absolute top-4 left-4 bg-blue-600 text-white px-4 py-2 rounded-md text-sm shadow-lg font-medium">
                ✨ AI Resultaat (Zonwering toegevoegd)
              </div>
            </div>
          ) : (
            // Anders tonen we het normale interactieve canvas
            <FacadeCanvas />
          )}
        </div>

      </section>
    </main>
  );
}
