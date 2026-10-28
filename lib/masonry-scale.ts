import type { MasonryResult } from './masonry-courses';
import type { MetricHints } from './facade-metric-hints';

// Product-owner test specification, 28 October 2026. An assumed course height,
// not an automatically established brick format or a manufacturing measurement.
export const TEST_COURSE_HEIGHT_MM=60;
export const SLAT_HEIGHT_MM=45;
export function masonryScaleHints(result:MasonryResult):MetricHints {
  const layers=result.layersOverSelection;
  if(result.status!=='agreement'||result.agreeingPatches<2||layers===null||!Number.isFinite(layers)||layers<=0)return {scaleSource:'unknown',courseUnit:null,patches:[]};
  return {scaleSource:'masonry-count-60mm-assumption',courseUnit:1/layers,patches:[]};
}
