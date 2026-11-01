import { NextResponse } from 'next/server';
import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { confirmSelectionPerspective, detectFacadeLines, validatePerspectiveCoordinates, type ImageSegment } from '@/lib/perspective-confirmation';

export const runtime='nodejs';
export const maxDuration=30;
const photos=new Map<string,{at:number;promise:Promise<{width:number;height:number;segments:ImageSegment[]}>}>();
const TTL=10*60_000;

export async function POST(request:Request){
  try{
    const size=Number(request.headers.get('content-length')||0);
    if(size>2_200_000)return NextResponse.json({error:'De werkfoto is te groot. Upload de foto opnieuw.'},{status:413});
    const text=await request.text();
    if(text.length>2_200_000)return NextResponse.json({error:'De werkfoto is te groot. Upload de foto opnieuw.'},{status:413});
    let body;try{body=JSON.parse(text);}catch{return NextResponse.json({error:'Ongeldig verzoek.'},{status:400});}
    const coordinates=validatePerspectiveCoordinates(body?.coordinates);
    const image=body?.image;
    if(typeof image!=='string'||image.length>2_000_000||!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=\r\n]+$/.test(image))return NextResponse.json({error:'Gebruik een geldige JPEG-, PNG- of WebP-werkfoto.'},{status:400});
    const hash=createHash('sha256').update(image).digest('hex'),now=Date.now();
    for(const [key,entry] of photos)if(now-entry.at>TTL)photos.delete(key);
    let entry=photos.get(hash);
    if(!entry){
      while(photos.size>=3)photos.delete(photos.keys().next().value!);
      const promise=(async()=>{
        const input=Buffer.from(image.slice(image.indexOf(',')+1),'base64');
        const {data,info}=await sharp(input,{limitInputPixels:24_000_000}).rotate().resize({width:960,height:960,fit:'inside',withoutEnlargement:true}).removeAlpha().greyscale().raw().toBuffer({resolveWithObject:true});
        return {width:info.width,height:info.height,segments:detectFacadeLines(data,info.width,info.height)};
      })();
      entry={at:now,promise};photos.set(hash,entry);
      // A rejected decode must never become a permanently cached failure.
      void promise.catch(()=>{if(photos.get(hash)?.promise===promise)photos.delete(hash);});
    }
    const data=await entry.promise;
    return NextResponse.json(confirmSelectionPerspective(data.segments,coordinates,data.width,data.height),{headers:{'Cache-Control':'no-store'}});
  }catch(error){
    const message=error instanceof Error?error.message:'';
    const selection=message.includes('hoek')||message.includes('analyseafmetingen');
    return NextResponse.json({error:selection?message:'De foto kon niet worden gecontroleerd. Probeer een andere of scherpere foto.'},{status:400,headers:{'Cache-Control':'no-store'}});
  }
}
