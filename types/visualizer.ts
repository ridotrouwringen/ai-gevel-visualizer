export type ProductType = 'ROLLUIKEN' | 'ZIPSCREENS' | 'KNIKARMSCHERMEN';

export type SystemColor = 'RAL_9005' | 'RAL_7016' | 'RAL_9010' | 'RAL_9001';

export type FabricColor = 
  | 'LIGHT_GREY' 
  | 'ANTHRACITE' 
  | 'BLACK_GREY' 
  | 'BLACK' 
  | 'SAND' 
  | 'OCHRE_YELLOW';

export interface MaskShape {
  id: string;
  sequenceNumber: number;
  type: 'POLYGON' | 'LINE';
  coordinates: { x: number; y: number }[];
  productType: ProductType;
  systemColor: SystemColor;
  fabricColor?: FabricColor;
}

export interface ColorDefinition {
  id: SystemColor | FabricColor;
  label: string;
  hex: string;
}

export const SYSTEM_COLORS: ColorDefinition[] = [
  { id: 'RAL_9005', label: 'Zwart (RAL 9005)', hex: '#0a0a0a' },
  { id: 'RAL_7016', label: 'Antraciet (RAL 7016)', hex: '#383e42' },
  { id: 'RAL_9010', label: 'Zuiver Wit (RAL 9010)', hex: '#f4f4f0' },
  { id: 'RAL_9001', label: 'Cremewit (RAL 9001)', hex: '#e8e3d7' },
];

export const ZIPSCREEN_FABRICS: ColorDefinition[] = [
  { id: 'LIGHT_GREY', label: 'Lichtgrijs', hex: '#d3d3d3' },
  { id: 'ANTHRACITE', label: 'Antraciet (RAL 7016)', hex: '#383e42' },
  { id: 'BLACK_GREY', label: 'Zwartgrijs', hex: '#2b2b2c' },
  { id: 'BLACK', label: 'Zwart', hex: '#111111' },
];

export const AWNING_FABRICS: ColorDefinition[] = [
  { id: 'SAND', label: 'Zand / Beige', hex: '#dcb88c' },
  { id: 'LIGHT_GREY', label: 'Lichtgrijs', hex: '#d3d3d3' },
  { id: 'ANTHRACITE', label: 'Antraciet', hex: '#383e42' },
  { id: 'OCHRE_YELLOW', label: 'Okergeel', hex: '#cc7722' },
];