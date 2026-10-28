'use client';

import { useVisualizerStore } from '@/store/visualizer-store';

/** Keep the original-photo evidence visible alongside the generated preview.
 * Results belong to an exact selection, not to pixels in the generated image.
 */
export function MasonryResultSummary(){
  const masks=useVisualizerStore(s=>s.masks);
  const checks=useVisualizerStore(s=>s.masonryChecks);
  const selections=masks.filter(m=>m.coordinates.length===4&&m.productType!=='KNIKARMSCHERMEN');
  if(!selections.length)return null;
  return <section aria-label="Getelde baksteenlagen" className="mt-3 w-full max-w-2xl max-h-[24vh] shrink-0 overflow-y-auto rounded-lg border border-fuchsia-200 bg-white p-3 text-sm text-slate-800">
    <h2 className="font-semibold">Baksteenlagen over de selectiehoogte</h2>
    {selections.map(mask=>{
      const saved=checks[mask.id];
      const check=saved?.key===JSON.stringify(mask.coordinates)?saved:undefined;
      const result=check?.status==='done'?check.result:undefined;
      return <div key={mask.id} className="mt-2 border-t border-slate-100 pt-2">
        <p className="font-semibold">Kozijn {mask.sequenceNumber}: {result?.layersOverSelection!=null?`circa ${result.layersOverSelection.toLocaleString('nl-NL',{maximumFractionDigits:1})} lagen`:check?.status==='checking'?'telling wordt uitgevoerd…':check?.status==='error'?'telling niet gelukt':result?'onvoldoende overeenkomst tussen stroken':'nog niet geteld'}</p>
        {result&&<p className="mt-1 text-xs text-slate-600">{result.patches.map(p=>`${p.label}: ${p.joints.length} voegen, ${p.intervals} volledige laagafstanden`).join(' · ')}</p>}
        {check?.status==='error'&&<p className="text-xs text-amber-800">{check.error}</p>}
      </div>;
    })}
    <p className="mt-2 text-xs text-slate-600">Experimentele telling uit de oorspronkelijke foto; geen millimetermaten. Kies ‘Origineel tonen’ om de roze voeglijnen te controleren of de telling te starten.</p>
  </section>;
}
