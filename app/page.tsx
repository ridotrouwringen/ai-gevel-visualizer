import { ProductSelector } from '@/components/configurator/product-selector';
import { FacadeCanvas } from '@/components/canvas/facade-canvas';

export default function Home() {
  return (
    <main className="flex h-screen w-full bg-gray-50 overflow-hidden font-sans">
      
      {/* Linker Paneel: Configurator */}
      <aside className="w-96 h-full flex-shrink-0 shadow-lg z-10 relative">
        <ProductSelector />
      </aside>

      {/* Rechter Paneel: Canvas & AI Visualizer */}
      <section className="flex-1 h-full relative flex flex-col">
        
        {/* Topbar */}
        <header className="h-16 bg-white border-b border-gray-200 flex items-center px-6 justify-between flex-shrink-0 z-10">
          <h1 className="text-xl font-bold text-gray-800">AI-Zonwering Visualizer</h1>
          <button className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700 transition-colors shadow-sm">
            Genereer Visualisatie
          </button>
        </header>

        {/* Werkruimte: Hier laden we nu ons dynamische component in */}
        <div className="flex-1 p-6 relative flex items-center justify-center bg-gray-100 overflow-auto">
          <FacadeCanvas />
        </div>

      </section>
    </main>
  );
}