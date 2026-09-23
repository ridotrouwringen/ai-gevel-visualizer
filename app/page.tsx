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
    // 1. Validatie: Is er wel een foto en is er wel iets getekend?
    if (!originalImage) {
      toast.error("Upload eerst een gevel foto!");
      return;
    }

    if (masks.length === 0) {
      toast.error("Teken minstens één product op de gevel (klik op een raam of trek een lijn).");
      return;
    }

    setIsGenerating(true);

    // 2. Het Data Pakketje (JSON Payload) voorbereiden voor de AI Server
    const payload = {
      image: originalImage, // Dit is de ruwe basisfoto (Base64) - nodig voor lossless generatie
      selections: masks.map(mask => ({
        id: mask.id,
        productType: mask.productType,
        systemColor: mask.systemColor,
        fabricColor: mask.fabricColor,
        type: mask.type, // Lijn of Vlak
        coordinates: mask.coordinates // De X/Y posities op de muur
      }))
    };

    // Voor nu loggen we het pakketje in de console, zodat je kunt zien wat er straks verzonden wordt
    console.log("🚀 Klaar om naar de AI Server te sturen:", JSON.stringify(payload, null, 2));

    try {
      // 3. Simulatie van de AI berekening (Straks komt hier de echte koppeling)
      await new Promise(resolve => setTimeout(resolve, 2000)); // Wacht 2 seconden
      toast.success("Data succesvol verzameld! (Check de F12 Console voor het JSON pakket)");
    } catch (error) {
      toast.error("Er is iets misgegaan bij het verzamelen van de data.");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <main className="flex h-screen w-full bg-gray-50 overflow-hidden font-sans">
      {/* Sonner Toaster voor de pop-up meldingen */}
      <Toaster position="top-center" richColors />

      {/* Linker Paneel: Configurator */}
      <aside className="w-96 h-full flex-shrink-0 shadow-lg z-10 relative">
        <ProductSelector />
      </aside>

      {/* Rechter Paneel: Canvas & AI Visualizer */}
      <section className="flex-1 h-full relative flex flex-col">
        
        {/* Topbar */}
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

        {/* Werkruimte */}
        <div className="flex-1 p-6 relative flex items-center justify-center bg-gray-100 overflow-auto">
          <FacadeCanvas />
        </div>

      </section>
    </main>
  );
}