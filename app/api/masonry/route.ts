import { NextResponse } from 'next/server';
import { validatePerspectiveCoordinates } from '@/lib/perspective-confirmation';
import { facadeCourseAnalysis } from '@/lib/masonry-analysis';

export const runtime='nodejs';
export const maxDuration=30;

export async function POST(request:Request){
  try{
    if(Number(request.headers.get('content-length')||0)>2_200_000)return NextResponse.json({error:'Upload de foto opnieuw; de werkfoto is te groot.'},{status:413});
    const text=await request.text();
    if(text.length>2_200_000)return NextResponse.json({error:'De werkfoto is te groot.'},{status:413});
    let body;try{body=JSON.parse(text);}catch{return NextResponse.json({error:'Ongeldig verzoek.'},{status:400});}
    const coordinates=validatePerspectiveCoordinates(body?.coordinates),image=body?.image;
    if(typeof image!=='string'||image.length>2_000_000||!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=\r\n]+$/.test(image))return NextResponse.json({error:'Gebruik een JPEG-, PNG- of WebP-werkfoto.'},{status:400});
    const result=await facadeCourseAnalysis(Buffer.from(image.slice(image.indexOf(',')+1),'base64'),coordinates);
    return NextResponse.json(result,{headers:{'Cache-Control':'no-store'}});
  }catch(error){
    const message=error instanceof Error?error.message:'';
    return NextResponse.json({error:message.includes('hoek')?message:'De laagcontrole is niet gelukt. Probeer een andere selectie of foto.'},{status:400,headers:{'Cache-Control':'no-store'}});
  }
}
