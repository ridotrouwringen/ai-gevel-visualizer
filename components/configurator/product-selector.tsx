"use client";

import { useVisualizerStore } from '@/store/visualizer-store';
import { 
  ProductType, 
  SYSTEM_COLORS, 
  ZIPSCREEN_FABRICS, 
  AWNING_FABRICS 
} from '@/types/visualizer';
import { SunSnow, Blinds, SunDim } from 'lucide-react';

export function ProductSelector() {
  const { 
    activeProduct, 
    setActiveProduct, 
    activeSystemColor, 
    setActiveSystemColor,
    activeFabricColor,
    setActiveFabricColor
  } = useVisualizerStore();

  const handleProductChange = (product: ProductType) => {
    setActiveProduct(product);
    if (product === 'ZIPSCREENS') setActiveFabricColor('ANTHRACITE');
    if (product === 'KNIKARMSCHERMEN') setActiveFabricColor('SAND');
  };

  return (
    <div className="flex flex-col gap-8 w-full max-w-sm bg-white p-6 border-r border-gray-200 h-full overflow-y-auto">
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">1. Kies Product</h2>
        <div className="grid grid-cols-1 gap-3">
          <ProductCard 
            title="Rolluiken" 
            icon={<Blinds size={24} />} 
            isActive={activeProduct === 'ROLLUIKEN'}
            onClick={() => handleProductChange('ROLLUIKEN')}
          />
          <ProductCard 
            title="Zipscreens" 
            icon={<SunDim size={24} />} 
            isActive={activeProduct === 'ZIPSCREENS'}
            onClick={() => handleProductChange('ZIPSCREENS')}
          />
          <ProductCard 
            title="Knikarmschermen" 
            icon={<SunSnow size={24} />} 
            isActive={activeProduct === 'KNIKARMSCHERMEN'}
            onClick={() => handleProductChange('KNIKARMSCHERMEN')}
          />
        </div>
      </div>

      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">2. Systeemkleur</h2>
        <p className="text-xs text-gray-500 mb-2">Kast & Zijgeleiders</p>
        <div className="flex flex-wrap gap-3">
          {SYSTEM_COLORS.map((color) => (
            <button
              key={color.id}
              onClick={() => setActiveSystemColor(color.id as any)}
              className={`w-10 h-10 rounded-full border-2 focus:outline-none transition-all ${
                activeSystemColor === color.id ? 'border-blue-500 scale-110 shadow-md' : 'border-gray-200 hover:scale-105'
              }`}
              style={{ backgroundColor: color.hex }}
              title={color.label}
            />
          ))}
        </div>
      </div>

      {activeProduct !== 'ROLLUIKEN' && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">3. Doekkleur</h2>
          <div className="flex flex-wrap gap-3">
            {(activeProduct === 'ZIPSCREENS' ? ZIPSCREEN_FABRICS : AWNING_FABRICS).map((color) => (
              <button
                key={color.id}
                onClick={() => setActiveFabricColor(color.id as any)}
                className={`w-10 h-10 rounded-full border-2 focus:outline-none transition-all ${
                  activeFabricColor === color.id ? 'border-blue-500 scale-110 shadow-md' : 'border-gray-200 hover:scale-105'
                }`}
                style={{ backgroundColor: color.hex }}
                title={color.label}
              />
            ))}
          </div>
        </div>
      )}

      <div className="mt-auto pt-6 border-t border-gray-100">
        <p className="text-sm text-gray-600">
          <strong>Tip:</strong> Selecteer hierboven uw configuratie en klik daarna op de ramen of gevel in de foto om deze toe te passen.
        </p>
      </div>
    </div>
  );
}

function ProductCard({ title, icon, isActive, onClick }: { title: string, icon: React.ReactNode, isActive: boolean, onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-4 p-4 rounded-lg border text-left transition-all ${
        isActive 
          ? 'border-blue-600 bg-blue-50 text-blue-900 ring-1 ring-blue-600' 
          : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
      }`}
    >
      <div className={`${isActive ? 'text-blue-600' : 'text-gray-500'}`}>
        {icon}
      </div>
      <span className="font-medium">{title}</span>
    </button>
  );
}