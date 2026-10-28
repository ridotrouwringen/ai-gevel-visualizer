import { NextResponse } from 'next/server';
import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { validatePerspectiveCoordinates } from '@/lib/perspective-confirmation';
import { countMasonryCourses } from '@/lib/masonry-courses';

export const runtime='nodejs';
export const maxDuration=30;
type Photo={data:Buffer;width:number;height:number};
const photos=new Map<string,{at:number;promise:Promise<Photo>}>();

export async function POST(request:Request){
  try{
    if(Number(request.headers.get('content-length')||0)>2_200_000)return NextResponse.json({error:'Upload de foto opnieuw; de werkfoto is te groot.'},{status:413});
    const text=await request.text();
    if(text.length>2_200_000)return NextResponse.json({error:'De werkfoto is te groot.'},{status:413});
    let body;try{body=JSON.parse(text);}catch{return NextResponse.json({error:'Ongeldig verzoek.'},{status:400});}
    const coordinates=validatePerspectiveCoordinates(body?.coordinates),image=body?.image;
    if(typeof image!=='string'||image.length>2_000_000||!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=\r\n]+$/.test(image))return NextResponse.json({error:'Gebruik een JPEG-, PNG- of WebP-werkfoto.'},{status:400});
    const key=createHash('sha256').update(image).digest('hex'),now=Date.now();
    for(const [k,v]of photos)if(now-v.at>600_000)photos.delete(k);
    let photo=photos.get(key);
    if(!photo){
      while(photos.size>=3)photos.delete(photos.keys().next().value!);
      const promise=(async()=>{
        const {data,info}=await sharp(Buffer.from(image.slice(image.indexOf(',')+1),'base64'),{limitInputPixels:24_000_000}).rotate().removeAlpha().greyscale().raw().toBuffer({resolveWithObject:true});
        return {data,width:info.width,height:info.height};
      })();
      photo={at:now,promise};photos.set(key,photo);
      void promise.catch(()=>{if(photos.get(key)?.promise===promise)photos.delete(key);});
    }
    const {data,width,height}=await photo.promise;
    return NextResponse.json(countMasonryCourses(data,width,height,coordinates),{headers:{'Cache-Control':'no-store'}});
  }catch(error){
    const message=error instanceof Error?error.message:'';
    return NextResponse.json({error:message.includes('hoek')?message:'De laagcontrole is niet gelukt. Probeer een andere selectie of foto.'},{status:400,headers:{'Cache-Control':'no-store'}});
  }
}
