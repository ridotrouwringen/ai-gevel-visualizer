import { create } from 'zustand';
import type { SavedMasonryCheck } from '@/lib/masonry-courses';
import { ProductType, SystemColor, FabricColor, MaskShape, MountingMode } from '@/types/visualizer';

interface VisualizerState {
  originalImage: string | null;
  generatedImage: string | null;
  
  activeProduct: ProductType;
  activeSystemColor: SystemColor;
  activeFabricColor: FabricColor | null;
  
  masks: MaskShape[];
  selectedMaskId: string | null;
  masonryChecks: Record<string,SavedMasonryCheck>;
  setMasonryCheck: (id:string,photo:string,check:SavedMasonryCheck) => void;
  activeMountingMode: MountingMode;
  selectMask: (id: string | null) => void;
  updateMask: (id: string, patch: Partial<Pick<MaskShape, 'coordinates' | 'rasterMasks' | 'mountingMode' | 'systemColor'>>) => void;
  setActiveMountingMode: (mode: MountingMode) => void;
  
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
  selectedMaskId: null,
  masonryChecks: {},
  setMasonryCheck: (id,photo,check) => set(state => {
    const mask=state.masks.find(m=>m.id===id);
    if(state.originalImage!==photo||!mask||JSON.stringify(mask.coordinates)!==check.key)return state;
    return {masonryChecks:{...state.masonryChecks,[id]:check}};
  }),
  activeMountingMode: 'OP_DE_DAG',
  selectMask: (id) => set(state => {
    const mask=state.masks.find(m=>m.id===id);
    return mask ? {selectedMaskId:id,activeProduct:mask.productType,activeSystemColor:mask.systemColor,
      activeFabricColor:mask.fabricColor ?? null,activeMountingMode:mask.mountingMode ?? 'OP_DE_DAG',generatedImage:null}
      : {selectedMaskId:null};
  }),
  updateMask: (id, patch) => set(state => ({masks:state.masks.map(m=>m.id===id?{...m,...patch}:m),generatedImage:null,
    masonryChecks:patch.coordinates?Object.fromEntries(Object.entries(state.masonryChecks).filter(([key])=>key!==id)):state.masonryChecks})),
  setActiveMountingMode: (mode) => set(state=>({activeMountingMode:mode,generatedImage:null,
    masks:state.masks.map(m=>m.id===state.selectedMaskId && m.productType==='ROLLUIKEN'?{...m,mountingMode:mode}:m)})),
  
  setOriginalImage: (dataUrl) => set({ originalImage: dataUrl, generatedImage: null, masks: [], selectedMaskId:null, masonryChecks:{} }),
  setGeneratedImage: (dataUrl) => set({ generatedImage: dataUrl }),
  
  setActiveProduct: (product) => set((state) => {
    let newFabricColor = state.activeFabricColor;
    if (product === 'ROLLUIKEN') newFabricColor = null;
    return { activeProduct: product, activeFabricColor: newFabricColor, selectedMaskId:null };
  }),
  setActiveSystemColor: (color) => set(state=>({ activeSystemColor: color, generatedImage:null,
    masks:state.masks.map(m=>m.id===state.selectedMaskId?{...m,systemColor:color}:m) })),
  setActiveFabricColor: (color) => set({ activeFabricColor: color }),
  
  addMask: (maskData) => set((state) => {
    const productMasks = state.masks.filter(m => m.productType === maskData.productType);
    const nextSequenceNumber = productMasks.length + 1;
    const newMask: MaskShape = {
      ...maskData,
      id: crypto.randomUUID(),
      sequenceNumber: nextSequenceNumber
    };
    return { masks: [...state.masks, newMask], selectedMaskId:newMask.id, generatedImage:null };
  }),
  
  removeMask: (id) => set((state) => ({
    masks: state.masks.filter((m) => m.id !== id), masonryChecks:Object.fromEntries(Object.entries(state.masonryChecks).filter(([key])=>key!==id)), generatedImage:null, selectedMaskId:state.selectedMaskId===id?null:state.selectedMaskId
  })),
  
  clearMasks: () => set({ masks: [], selectedMaskId:null, generatedImage:null, masonryChecks:{} }),
}));