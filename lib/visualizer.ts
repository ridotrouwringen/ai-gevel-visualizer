import { WindowAnchor } from '@/components/facade-canvas';

export interface ProductConfig {
  type: 'rolluik' | 'screen' | 'knikarmscherm';
  frameColor: string; // bijv. "RAL 7016", "RAL 9010", "RAL 9001"
  fabricColor?: string; // bijv. "antraciet", "zand", "licht grijs", "oker geel"
}

export function buildVisualizationPrompt(
  windows: WindowAnchor[],
  config: ProductConfig
): string {
  // Filter alleen de aangevinkte ramen
  const activeWindows = windows.filter((w) => w.selected);
  const anchorsDescription = activeWindows
    .map((w, i) => `Raam ${i + 1} bevindt zich op relatieve coördinaten (X: ${w.x}%, Y: ${w.y}%)`)
    .join('; ');

  return `
Jij bent een specialistisch architectuur- en visuele inpainting-model voor zonwering.
Je krijgt een foto van een achtergevel. De gebruiker heeft met ankerpunten de specifieke ramen aangegeven waar zonwering gemonteerd moet worden: [ ${anchorsDescription} ].

STRIKTE INSTRUCTIES:
1. **Behoud van de omgeving:** Houd het originele gebouw, de stenen, het metselwerk, de voeglijnen, het dak, deuren en de directe omgeving 100% identiek aan de originele foto. Verander niets aan de gevel zelf.
2. **Diepte & Perspectief:** Analyseer de diepte en het perspectief van de gevel op basis van de foto. Pas de kaders en de hoek van de zonwering feilloos aan op het perspectief van elk geselecteerd raam.
3. **Productspecificatie:**
   - Type product: ${config.type.toUpperCase()}
   - Kleur cassette/kast en geleiders: ${config.frameColor}
   ${config.fabricColor ? `- Kleur doek: ${config.fabricColor}` : ''}
4. **Simultane montage:** Monteer het gekozen product in één keer strak en realistisch over de aangegeven ramen heen. Zorg voor realistische schaduwval onder de bak/cassette en een natuurlijke integratie op het kozijn.
`;
}