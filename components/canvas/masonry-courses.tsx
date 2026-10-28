'use client';

import { useEffect, useRef, useState } from 'react';
import type { Point } from '@/lib/perspective-confirmation';
import type { MasonryResult } from '@/lib/masonry-courses';

type CheckState={image:string;key:string;status:'checking'|'done'|'error';result?:MasonryResult;error?:string};
export function useMasonryCourses(image:string|null,coordinates:Point[]|undefined,enabled:boolean){
  const key=coordinates?.length===4?JSON.stringify(coordinates):'';
  const [state,setState]=useState<CheckState|null>(null);
  const [retryToken,setRetryToken]=useState(0);
  const cache=useRef(new Map<string,MasonryResult>());
  const cacheImage=useRef<string|null>(null);
  useEffect(()=>{
    if(cacheImage.current!==image){cache.current.clear();cacheImage.current=image;}
    if(!enabled||!image||!key)return;
    const controller=new AbortController();let active=true;
    const cached=cache.current.get(key);
    if(cached){setState({image,key,status:'done',result:cached});return;}
    setState({image,key,status:'checking'});
    let timeout:ReturnType<typeof setTimeout>|undefined;
    const timer=setTimeout(async()=>{
      timeout=setTimeout(()=>controller.abort(),20_000);
      try{
        const response=await fetch('/api/masonry',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({image,coordinates:JSON.parse(key)}),signal:controller.signal});
        const result=await response.json();
        if(!response.ok)throw Error(result.error||'De laagcontrole is niet gelukt.');
        if(!active)return;
        if(cache.current.size>=20)cache.current.delete(cache.current.keys().next().value!);
        cache.current.set(key,result);setState({image,key,status:'done',result});
      }catch(error){
        if(active)setState({image,key,status:'error',error:controller.signal.aborted?'De controle duurde te lang. Probeer opnieuw.':error instanceof Error?error.message:'De laagcontrole is niet gelukt.'});
      }finally{if(timeout)clearTimeout(timeout);}
    },450);
    return ()=>{active=false;clearTimeout(timer);if(timeout)clearTimeout(timeout);controller.abort();};
  },[image,key,enabled,retryToken]);
  const current=enabled&&state?.image===image&&state.key===key?state:null;
  return {state:current,result:current?.status==='done'?current.result:undefined,retry:()=>{cache.current.delete(key);setRetryToken(t=>t+1);}};
}

export function MasonryCourseOverlay({result}:{result:MasonryResult|undefined}){
  if(!result)return null;
  return <svg aria-label="Baksteenvoegen binnen de selectiehoogte" data-testid="masonry-overlay" viewBox="0 0 1000 1000" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full overflow-hidden">
    {result.patches.map(p=><g key={p.id}>
      <polygon points={p.polygon.map(q=>`${q.x*1000},${q.y*1000}`).join(' ')} fill={p.joints.length?'#ff65d810':'none'} stroke={p.joints.length?'#ff65d8':'#a3a3a3'} strokeDasharray="4 4" strokeWidth={1} vectorEffect="non-scaling-stroke"/>
      {p.joints.map((s,i)=><line key={i} x1={s.start.x*1000} y1={s.start.y*1000} x2={s.end.x*1000} y2={s.end.y*1000} stroke="#ff65d8" strokeWidth={2} vectorEffect="non-scaling-stroke"/>)}
    </g>)}
  </svg>;
}

export function MasonryCourseControls({enabled,onToggle,hasSelection,state,onRetry}:{enabled:boolean;onToggle:()=>void;hasSelection:boolean;state:CheckState|null;onRetry:()=>void}){
  const result=state?.status==='done'?state.result:undefined;
  return <div className="mt-3 border-t border-slate-200 pt-3">
    <button type="button" aria-pressed={enabled} disabled={!hasSelection} onClick={onToggle} className="rounded bg-fuchsia-100 px-2 py-1 font-semibold text-fuchsia-950 disabled:opacity-50">{enabled?'Laagtelling uitzetten':'Baksteenlagen tellen'}</button>
    {enabled&&hasSelection&&<div className="mt-2 space-y-1" role="status" aria-live="polite">
      <p>Alleen de hoogte van jouw selectie. Roze lijnen: gevonden voegen naast het kozijn.</p>
      {(!state||state.status==='checking')&&<p>Voegen en herhaling zoeken…</p>}
      {state?.status==='error'&&<><p className="text-amber-800">{state.error}</p><button type="button" className="underline" onClick={onRetry}>Opnieuw proberen</button></>}
      {result&&<>
        <p className="font-semibold">{result.layersOverSelection!==null?`Circa ${result.layersOverSelection.toLocaleString('nl-NL',{maximumFractionDigits:1})} lagen over de selectiehoogte`:'Nog geen overeenkomende telling uit meerdere stroken'}</p>
        <p>{result.agreeingPatches>=2?`${result.agreeingPatches} stroken hebben een vergelijkbare laagafstand.`:'Onvoldoende bevestiging; controleer de stroken.'}</p>
        <ul className="space-y-1">{result.patches.map(p=><li key={p.id}><span className="font-medium">{p.label}:</span> {p.joints.length?`${p.joints.length} voegen · ${p.intervals} volledige laagafstanden${result.layersOverSelection!==null&&p.period!==null&&Math.abs(p.period*result.layersOverSelection-1)>.15?' · afwijkende laagafstand':''}` :p.reason}</li>)}</ul>
        <p className="text-slate-600">Experimenteel: controleer of roze lijnen echt voegen volgen en op dezelfde gevelzijde liggen. Bekleding kan ook herhalen. Een deel van een laag aan de boven- of onderrand telt mee in de schatting. Geen millimetermaten.</p>
      </>}
    </div>}
  </div>;
}
