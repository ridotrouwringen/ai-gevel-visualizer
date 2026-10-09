"use client";

import { useRef, useState, type ChangeEvent } from 'react';
import { ProductSelector } from '@/components/configurator/product-selector';
import { FacadeCanvas } from '@/components/canvas/facade-canvas';
import { useVisualizerStore } from '@/store/visualizer-store';
import { Toaster, toast } from 'sonner';
import { Loader2, RotateCcw } from 'lucide-react';

export default function Home() {
  const { originalImage, generatedImage, setGeneratedImage, masks, setOriginalImage, clearMasks } = useVisualizerStore();
  const [isGenerating, setIsGenerating] = useState(false);
  const referenceInputRef = useRef<HTMLInputElement>(null);
  const [productReferenceFiles, setProductReferenceFiles] = useState<{ name: string; dataUrl: string }[]>([]);

  const handleProductReferenceUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (files.length === 0) return;
    if (files.length > 3) {
      toast.error("Selecteer maximaal 3 productreferenties.");
      return;
    }
    const unsupported = files.find((file) => !["image/jpeg", "image/png", "image/webp"].includes(file.type));
    if (unsupported) {
      toast.error("Gebruik alleen JPEG-, PNG- of WebP-afbeeldingen.");
      return;
    }
    const oversized = files.find((file) => file.size > 500_000);
    if (oversized) {
      toast.error("Elke productreferentie mag maximaal 500 KB zijn.");
      return;
    }

    const readAsDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => typeof reader.result === "string"
        ? resolve(reader.result)
        : reject(new Error("Een productreferentie kon niet worden gelezen."));
      reader.onerror = () => reject(new Error("Een productreferentie kon niet worden gelezen."));
      reader.readAsDataURL(file);
    });

    try {
      const loaded = await Promise.all(files.map(async (file) => ({
        name: file.name,
        dataUrl: await readAsDataUrl(file),
      })));
      setProductReferenceFiles(loaded);
      toast.success(`${loaded.length} productreferentie(s) toegevoegd aan de rolluiktest.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Productreferenties konden niet worden gelezen.");
    }
  };

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
      productReferenceImages: masks.some((mask) => mask.productType === "ROLLUIKEN")
        ? productReferenceFiles.map((file) => file.dataUrl)
        : [],
      selections: masks.map(mask => ({
        id: mask.id,
        productType: mask.productType,
        systemColor: mask.systemColor,
        fabricColor: mask.fabricColor,
        type: mask.type,
        coordinates: mask.coordinates,
        mountingMode: mask.mountingMode,
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
          <div className="flex flex-col min-w-0">
            <h1 className="text-xl font-bold text-gray-800">AI-Zonwering Visualizer</h1>
            <span className="text-xs text-gray-500">Rolluiktest: optioneel echte productfoto's uit Bibliotheek /rolluiken toevoegen</span>
          </div>

          <div className="flex items-center gap-3">
            <input
              ref={referenceInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              onChange={handleProductReferenceUpload}
              className="hidden"
              aria-label="Productreferentiefoto's selecteren"
            />
            <button
              type="button"
              onClick={() => referenceInputRef.current?.click()}
              disabled={isGenerating}
              title={productReferenceFiles.map((file) => file.name).join(", ") || "Selecteer maximaal 3 foto's, bijvoorbeeld 0011, 0008 en 0000"}
              className="px-3 py-2 rounded-md text-xs font-medium border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Productreferenties ({productReferenceFiles.length}/3)
            </button>
            {productReferenceFiles.length > 0 && (
              <button
                type="button"
                onClick={() => setProductReferenceFiles([])}
                disabled={isGenerating}
                className="px-2 py-2 rounded-md text-xs text-gray-500 hover:bg-gray-100 disabled:opacity-50"
              >
                Wissen
              </button>
            )}
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
