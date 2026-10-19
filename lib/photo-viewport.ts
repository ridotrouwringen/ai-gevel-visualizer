export type ViewPoint = { x: number; y: number };
export type PhotoView = ViewPoint & { scale: number };
export const FIT_PHOTO: PhotoView = { scale: 1, x: 0, y: 0 };
export const MAX_PHOTO_ZOOM = 8;

export function constrainPhotoView(view: PhotoView, width: number, height: number): PhotoView {
  const scale = Math.max(1, Math.min(MAX_PHOTO_ZOOM, view.scale));
  return {
    scale,
    x: Math.min(0, Math.max(width * (1 - scale), view.x)),
    y: Math.min(0, Math.max(height * (1 - scale), view.y)),
  };
}

/** Anchor is measured in the untransformed photo frame, in CSS pixels. */
export function zoomPhotoAt(view: PhotoView, scale: number, anchor: ViewPoint, width: number, height: number): PhotoView {
  const nextScale = Math.max(1, Math.min(MAX_PHOTO_ZOOM, scale));
  const ratio = nextScale / view.scale;
  return constrainPhotoView({ scale: nextScale, x: anchor.x - (anchor.x - view.x) * ratio,
    y: anchor.y - (anchor.y - view.y) * ratio }, width, height);
}

/** Selection coordinates always belong to the complete original image. */
export function photoPointFromClient(client: ViewPoint, rect: { left: number; top: number; width: number; height: number }): ViewPoint {
  return { x: Math.max(0, Math.min(1, (client.x - rect.left) / rect.width)),
    y: Math.max(0, Math.min(1, (client.y - rect.top) / rect.height)) };
}
