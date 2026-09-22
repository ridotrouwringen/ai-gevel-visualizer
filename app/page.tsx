import { ProductSelector } from '@/components/configurator/product-selector';

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

        {/* Werkruimte voor de foto (Tijdelijke placeholder) */}
        <div className="flex-1 p-6 relative flex items-center justify-center bg-gray-100 overflow-auto">
          <div className="max-w-3xl w-full text-center border-2 border-dashed border-gray-300 rounded-xl p-12 bg-white flex flex-col items-center justify-center shadow-sm">
             <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4 border border-gray-100">
               <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8 text-gray-500">
                 <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
               </svg>
             </div>
             <h3 className="text-lg font-semibold text-gray-900 mb-2">Upload een gevel foto</h3>
             <p className="text-gray-500 mb-6 max-w-md">
               Kies een duidelijke foto van de voor- of achterkant van het huis. Zorg dat de ramen goed zichtbaar zijn.
             </p>
             <button className="bg-white border border-gray-300 text-gray-700 font-medium py-2 px-6 rounded-md hover:bg-gray-50 transition-colors shadow-sm">
               Kies Afbeelding
             </button>
          </div>
        </div>

      </section>
    </main>
  );
}