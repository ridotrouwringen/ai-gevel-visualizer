export type ProductType = 'rolluik' | 'screen' | 'knikarmscherm';

export type ColorOption = {
  id: string;
  name: string;
  hex: string;
  ral?: string;
};

export interface WindowSpot {
  id: string;
  label: string;
  x: number; // Percentage vanaf links
  y: number; // Percentage vanaf boven
  width?: number;
  height?: number;
  product: ProductType;
  frameColor: string; // hex of ral code
  fabricColor?: string; // hex of naam
}

export interface ProductConfig {
  type: ProductType;
  frameColor: string;
  fabricColor?: string;
}

// Standaardopties en constanten
export const PRODUCTS = [
  { value: 'rolluik', label: 'Rolluik', description: 'Volledige afsluiting en isolatie' },
  { value: 'screen', label: 'Screen', description: 'Strak, windvast en doorzicht naar buiten' },
  { value: 'knikarmscherm', label: 'Knikarmscherm', description: 'Terraszonwering met uitval' },
] as const;

export const FRAME_COLORS: ColorOption[] = [
  { id: 'ral-7016', name: 'Antracietgrijs', hex: '#383E42', ral: 'RAL 7016' },
  { id: 'ral-9010', name: 'Zuiver wit', hex: '#F1F3F2', ral: 'RAL 9010' },
  { id: 'ral-9001', name: 'Crèmewit', hex: '#F0EEE9', ral: 'RAL 9001' },
];

export const FABRIC_COLORS: ColorOption[] = [
  { id: 'antraciet', name: 'Antraciet', hex: '#2B2D2F' },
  { id: 'grijs-zwart', name: 'Grijs Zwart', hex: '#1C1E21' },
  { id: 'zwart', name: 'Zwart', hex: '#111111' },
  { id: 'zand', name: 'Zand', hex: '#C2B29B' },
  { id: 'licht-grijs', name: 'Licht Grijs', hex: '#D0D3D4' },
  { id: 'oker-geel', name: 'Oker Geel', hex: '#C68A36' },
];

export const DEFAULT_SPOTS: WindowSpot[] = [];

export function productLabel(type: ProductType): string {
  const found = PRODUCTS.find((p) => p.value === type);
  return found ? found.label : type;
}

// Prompt generator voor Gemini Inpainting met perspectief- en diepte-instructie
export function buildGeminiPrompt(targetSpots: WindowSpot[]): string {
  const anchorsDescription = targetSpots
    .map((s, i) => `Zone ${i + 1} ("${s.label}") op coördinaten (X: ${s.x}%, Y: ${s.y}%) voor een ${s.product} met kast/geleiders in ${s.frameColor}${s.fabricColor ? ` en doek in ${s.fabricColor}` : ''}`)
    .join('; ');

  return `
Jij bent een specialistisch architectuur- en visuele inpainting-model voor zonwering.
Je krijgt een foto van een achtergevel. De gebruiker heeft met ankerpunten de specifieke locaties aangegeven waar zonwering gemonteerd moet worden: [ ${anchorsDescription} ].

STRIKTE INSTRUCTIES:
1. **Behoud van de omgeving:** Houd het originele gebouw, de stenen, het metselwerk, de voeglijnen, het dak, deuren en de directe omgeving 100% identiek aan de originele foto. Verander niets aan de gevel zelf.
2. **Diepte & Perspectief:** Analyseer de diepte en het perspectief van de gevel op basis van de foto. Pas de kaders en de hoek van de zonwering feilloos aan op het perspectief van elk geselecteerd raam/gebied op basis van de aangegeven ankerpunten.
3. **Productspecificaties per zone:** Volg exact de gekozen producttypen en kleuren per geselecteerde zone.
4. **Simultane montage:** Monteer de gekozen producten in één keer strak en realistisch op de aangegeven plekken. Zorg voor realistische schaduwval onder de bak/cassette en een natuurlijke integratie op de gevel.
`;
}