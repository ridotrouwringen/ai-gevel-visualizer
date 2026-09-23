export interface ProductInfo {
  id: string;
  name: string;
  referenceImage: string; // Het pad naar de voorbeeld-foto in de public-map
  defaultPrompt: string;
}

export const PRODUCTS_LIBRARY: Record<string, ProductInfo> = {
  ROLLUIKEN: {
    id: 'ROLLUIKEN',
    name: 'Rolluik',
    referenceImage: '/products/rolluik.jpg',
    defaultPrompt: 'An exterior aluminum roller shutter (rolluik) fitted neatly on the window recess.'
  },
  ZIPSCREENS: {
    id: 'ZIPSCREENS',
    name: 'Zipscreen',
    referenceImage: '/products/zipscreen.jpg',
    defaultPrompt: 'A modern vertical zip screen sun protection mounted tightly on the window frame.'
  },
  KNIKARMSCHERMEN: {
    id: 'KNIKARMSCHERMEN',
    name: 'Knikarmscherm',
    referenceImage: '/products/knikarmscherm.jpg',
    defaultPrompt: 'A modern folding arm awning mounted horizontally on the facade wall above the window.'
  }
};