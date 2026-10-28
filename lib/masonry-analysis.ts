import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { countMasonryCourses, type MasonryResult } from './masonry-courses';
import { validatePerspectiveCoordinates, type Point } from './perspective-confirmation';

type Photo={data:Buffer;width:number;height:number};
const photos=new Map<string,{at:number;photo:Promise<Photo>;results:Map<string,Promise<MasonryResult>>}>();
/** Shared by the count endpoint and deterministic shutter rendering. No second
 * repetition detector or client-supplied scale is used for product dimensions.
 */
export async function facadeCourseAnalysis(input:Buffer,coordinates:Point[]):Promise<MasonryResult>{
  const q=validatePerspectiveCoordinates(coordinates),key=JSON.stringify(q);
  const hash=createHash('sha256').update(input).digest('hex'),now=Date.now();
  for(const [k,v]of photos)if(now-v.at>600_000)photos.delete(k);
  let entry=photos.get(hash);
  if(!entry){
    while(photos.size>=3)photos.delete(photos.keys().next().value!);
    const photo=(async()=>{
      const {data,info}=await sharp(input,{limitInputPixels:24_000_000}).rotate().removeAlpha().greyscale().raw().toBuffer({resolveWithObject:true});
      return {data,width:info.width,height:info.height};
    })();
    entry={at:now,photo,results:new Map()};photos.set(hash,entry);
    void photo.catch(()=>{if(photos.get(hash)?.photo===photo)photos.delete(hash);});
  }
  let result=entry.results.get(key);
  if(!result){
    while(entry.results.size>=20)entry.results.delete(entry.results.keys().next().value!);
    result=entry.photo.then(({data,width,height})=>countMasonryCourses(data,width,height,q));
    entry.results.set(key,result);
    const current=entry;void result.catch(()=>{if(current.results.get(key)===result)current.results.delete(key);});
  }
  return result;
}
