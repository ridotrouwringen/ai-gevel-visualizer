import { create } from 'zustand';
import { ProductType, SystemColor, FabricColor, MaskShape } from '@/types/visualizer';

interface VisualizerState {
  originalImage: string | null;
  generatedImage: string | null;
  
  activeProduct: ProductType;
  activeSystemColor: SystemColor;
  activeFabricColor: FabricColor | null;
  
  masks: MaskShape[];
  
  setOriginalImage: (dataUrl: string) => void;
  setGeneratedImage: (dataUrl: string | null) => void;
  setActiveProduct: (product: ProductType) => void;
  setActiveSystemColor: (color: SystemColor) => void;
  setActiveFabricColor: (color: FabricColor | null) => void;
  addMask: (mask: Omit<MaskShape, 'id' | 'sequenceNumber'>) => void;
  removeMask: (id: string) => void;
  clearMasks: () => void;
}

export const useVisualizerStore = create<VisualizerState>((set) => ({
  originalImage: null,
  generatedImage: null,
  
  activeProduct: 'ROLLUIKEN',
  activeSystemColor: 'RAL_7016',
  activeFabricColor: null,
  
  masks: [],
  
  setOriginalImage: (dataUrl) => set({ originalImage: dataUrl, generatedImage: null, masks: [] }),
  setGeneratedImage: (dataUrl) => set({ generatedImage: dataUrl }),
  
  setActiveProduct: (product) => set((state) => {
    let newFabricColor = state.activeFabricColor;
    if (product === 'ROLLUIKEN') newFabricColor = null;
    return { activeProduct: product, activeFabricColor: newFabricColor };
  }),
  setActiveSystemColor: (color) => set({ activeSystemColor: color }),
  setActiveFabricColor: (color) => set({ activeFabricColor: color }),
  
  addMask: (maskData) => set((state) => {
    const productMasks = state.masks.filter(m => m.productType === maskData.productType);
    const nextSequenceNumber = productMasks.length + 1;
    const newMask: MaskShape = {
      ...maskData,
      id: crypto.randomUUID(),
      sequenceNumber: nextSequenceNumber
    };
    return { masks: [...state.masks, newMask] };
  }),
  
  removeMask: (id) => set((state) => ({
    masks: state.masks.filter((m) => m.id !== id)
  })),
  
  clearMasks: () => set({ masks: [] }),
}));