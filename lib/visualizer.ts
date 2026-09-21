export type ProductType = 'rolluik' | 'screen' | 'knikarmscherm';

export type ColorOption = {
  id: string;
  name: string;
  hex: string;
  ral?: string;
};

export interface WindowSpot {
  id: string;
  number: number;
  label: string;
  type: 'point' | 'line';
  x: number; // Start X percentage
  y: number; // Start Y percentage
  endX?: number; // Eind X percentage (voor lijnen/knikarmschermen)
  endY?: number; // Eind Y percentage (voor lijnen/knikarmschermen)
  product: ProductType;
  frameColor: string;
  fabricColor?: string;
}

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

export function productLabel(type: ProductType): string {
  const found = PRODUCTS.find((p) => p.value === type);
  return found ? found.label : type;
}

export function buildGeminiPrompt(targetSpots: WindowSpot[]): string {
  const elementsDescription = targetSpots
    .map((s, i) => {
      const positionDesc =
        s.type === 'line' && s.endX !== undefined && s.endY !== undefined
          ? `van horizontaal coördinaat (X: ${s.x}%, Y: ${s.y}%) tot (X: ${s.endX}%, Y: ${s.endY}%)`
          : `op raam-coördinaat (X: ${s.x}%, Y: ${s.y}%)`;

      return `Locatie ${i + 1}: ${productLabel(s.product)} ${positionDesc} met cassette/lijsten in ${s.frameColor}${s.fabricColor ? ` en doek in ${s.fabricColor}` : ''}`;
    })
    .join('; ');

  return `
Jij bent een specialistisch architectuur- en visuele inpainting-model voor zonwering.
Je krijgt een originele foto van een gevel. De gebruiker heeft nauwkeurig aangegeven waar zonwering gemonteerd moet worden: [ ${elementsDescription} ].

ABSOLUTE STRIKTE INSTRUCTIES VOOR FOTOREALISME & FORMAAT:
1. **Identiek formaat en resolutie:** De output foto moet exact dezelfde hoogte, breedte, aspect ratio en resolutie hebben als de originele invoerfoto. Er mag geen enkele verandering, crop of schaling optreden in het totale canvas.
2. **100% Identieke kloon van de omgeving:** Behoud de originele foto van het gebouw, de stenen, het metselwerk, de voegen, het dak, deuren, ramen en de directe omgeving pixel-voor-pixel identiek. Verander niets aan de gevel zelf.
3. **Voorgrond & Objecten (Diepte-laag):** Als er objecten zoals struiken, bomen, planten, regenpijpen, tuinmeubelen of auto's op de voorgrond staan die (gedeeltelijk) voor de gevel of het raam vallen, **moeten deze exact op de voorgrond blijven**. De zonwering moet natuurgetrouw *achter* of *tussen* deze voorgrond-elementen worden geplaatst, alsof het er in de echte wereld gemonteerd is. Geen enkele tak of struik mag zomaar worden weggesneden.
4. **Diepte, Perspectief & Schaduw:** Analyseer de lichtval, de diepte en het perspectief van de gevel op de originele foto. Pas de hoek, de cassette en de uitval van elk product feilloos aan op basis van de opgegeven punten of rechte lijnen. Voeg realistische subtiele schaduwval toe onder de bakken en schermen voor een maximaal fotorealistisch resultaat.
5. **Simultane en-en montage:** Monteer alle gekozen producten (screens, rolluiken én knikarmschermen tegelijk) strak en feilloos op de aangegeven locaties.
`;
}