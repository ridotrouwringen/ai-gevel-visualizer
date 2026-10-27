'use client';

import { useEffect, useRef, useState } from 'react';
import type { PerspectiveConfirmation, Point } from '@/lib/perspective-confirmation';

type CheckState={image:string;key:string;status:'checking'|'done'|'error';result?:PerspectiveConfirmation;error?:string};

export function useSelectionPerspective(image:string|null,coordinates:Point[]|undefined,enabled:boolean){
  const key=coordinates?.length===4?JSON.stringify(coordinates):'';
  const [state,setState]=useState<CheckState|null>(null);
  const [retryToken,setRetryToken]=useState(0);
  const cache=useRef(new Map<string,PerspectiveConfirmation>());
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
        const response=await fetch('/api/perspective',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({image,coordinates:JSON.parse(key)}),signal:controller.signal});
        const result=await response.json();
        if(!response.ok)throw Error(result.error||'De perspectiefcontrole is niet gelukt.');
        if(!active)return;
        if(cache.current.size>=30)cache.current.delete(cache.current.keys().next().value!);
        cache.current.set(key,result);
        setState({image,key,status:'done',result});
      }catch(error){
        if(active)setState({image,key,status:'error',error:controller.signal.aborted?'De controle duurde te lang. Probeer opnieuw.':error instanceof Error?error.message:'De controle is niet gelukt.'});
      }finally{if(timeout)clearTimeout(timeout);}
    },450);
    return ()=>{active=false;clearTimeout(timer);if(timeout)clearTimeout(timeout);controller.abort();};
  },[image,key,enabled,retryToken]);
  const current=enabled&&state?.image===image&&state.key===key?state:null;
  return {state:current,result:current?.status==='done'?current.result:undefined,retry:()=>{cache.current.delete(key);setRetryToken(t=>t+1);}};
}

export function PerspectiveCheckOverlay({result}:{result:PerspectiveConfirmation|undefined}){
  if(!result)return null;
  const {analysisWidth:w,analysisHeight:h,coordinates:q}=result;
  const segment=(a:Point,b:Point,color:string,key:string,width=2)=><line key={key} x1={a.x*w} y1={a.y*h} x2={b.x*w} y2={b.y*h} stroke={color} strokeWidth={width} vectorEffect="non-scaling-stroke"/>;
  return <svg aria-label="Selectieranden en bevestigingslijnen" data-testid="perspective-overlay" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full overflow-hidden">
    {result.horizontal.lines.map((s,i)=>segment(s.start,s.end,'#22e6a1',`h${i}`))}
    {result.vertical.lines.map((s,i)=>segment(s.start,s.end,'#38d5ff',`v${i}`))}
    {segment(q[0],q[1],'#ffe14a','top',4)}
    {segment(q[3],q[2],'#ffe14a','bottom',4)}
    {segment(q[0],q[3],'#ffe14a','left',3)}
    {segment(q[1],q[2],'#ffe14a','right',3)}
    {[...result.horizontal.lines,...result.vertical.lines].map((s,i)=><text key={`label${i}`} x={(s.start.x+s.end.x)/2*w} y={(s.start.y+s.end.y)/2*h-5} fontSize={12} fill="white" stroke="#14212b" strokeWidth={3} paintOrder="stroke" textAnchor="middle">{i<result.horizontal.lines.length?`H${i+1}`:`V${i-result.horizontal.lines.length+1}`}</text>)}
  </svg>;
}

export function PerspectiveCheckPanel({enabled,onToggle,hasSelection,sequence,state,onRetry}:{enabled:boolean;onToggle:()=>void;hasSelection:boolean;sequence:number|undefined;state:CheckState|null;onRetry:()=>void}){
  const [expanded,setExpanded]=useState(true);
  const result=state?.status==='done'?state.result:undefined;
  const label=(count:number)=>count>=2?`${count} extra lijnen ondersteunen de richting`:count===1?'1 extra lijn gevonden':'Geen extra bevestiging gevonden';
  return <section aria-label="Perspectiefcontrole" className="absolute bottom-20 right-4 z-20 w-72 max-w-[45%] rounded-lg border border-slate-300 bg-white/95 p-3 text-xs text-slate-800 shadow-lg">
    <div className="flex items-center justify-between gap-2">
      <button type="button" aria-expanded={expanded} onClick={()=>setExpanded(v=>!v)} className="text-left font-semibold">Perspectief{sequence?` · selectie ${sequence}`:''} {expanded?'▾':'▸'}</button>
      <button type="button" aria-pressed={enabled} onClick={onToggle} className={`rounded px-2 py-1 font-medium ${enabled?'bg-emerald-100 text-emerald-900':'bg-slate-100'}`}>{enabled?'Lijnen aan':'Lijnen uit'}</button>
    </div>
    {expanded&&<>
      <p className="mt-2">Jouw boven- en onderrand zijn leidend. Extra beeldlijnen zoeken bevestiging.</p>
      {!hasSelection&&<p className="mt-2 text-slate-600">Wijs de hoeken aan: linksboven → rechtsboven → rechtsonder → linksonder.</p>}
      {hasSelection&&enabled&&<div className="mt-2 space-y-1" role="status" aria-live="polite">
        {(!state||state.status==='checking')&&<p>Bevestigingslijnen zoeken…</p>}
        {state?.status==='error'&&<><p className="text-amber-800">{state.error}</p><button type="button" className="underline" onClick={onRetry}>Opnieuw controleren</button></>}
        {result&&<>
          <p><span className="font-semibold">Horizontaal:</span> {label(result.horizontal.lines.length)}</p>
          <p><span className="font-semibold">Verticaal:</span> {label(result.vertical.lines.length)}</p>
          <p className="pt-1 text-slate-600">Geel: jouw randen. Groen: horizontale bevestiging. Blauw: verticale bevestiging.</p>
          <p className="text-slate-600">Je selectie blijft behouden. Deze controle bepaalt geen millimetermaten.</p>
        </>}
      </div>}
    </>}
  </section>;
}
