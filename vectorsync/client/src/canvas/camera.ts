import { Vector2D } from '../shared/types';

/**
 * 2D affine camera: world -> screen is [sx 0 tx; 0 sy ty; 0 0 1].
 * We keep sx === sy (uniform zoom) since a vector canvas shouldn't skew shapes.
 */
export interface Camera {
  scale: number;
  tx: number;
  ty: number;
}

export function screenToWorld(cam: Camera, p: Vector2D): Vector2D {
  return { x: (p.x - cam.tx) / cam.scale, y: (p.y - cam.ty) / cam.scale };
}

export function worldToScreen(cam: Camera, p: Vector2D): Vector2D {
  return { x: p.x * cam.scale + cam.tx, y: p.y * cam.scale + cam.ty };
}

/** Zoom while keeping the world point under the cursor fixed on screen. */
export function zoomAt(cam: Camera, screenPoint: Vector2D, factor: number): Camera {
  const newScale = Math.min(8, Math.max(0.05, cam.scale * factor));
  const worldPoint = screenToWorld(cam, screenPoint);
  return {
    scale: newScale,
    tx: screenPoint.x - worldPoint.x * newScale,
    ty: screenPoint.y - worldPoint.y * newScale,
  };
}

/** The visible world-space rectangle for a given viewport size — used to
 *  build the R-Tree query box for culling. */
export function visibleWorldBounds(cam: Camera, width: number, height: number) {
  const topLeft = screenToWorld(cam, { x: 0, y: 0 });
  const bottomRight = screenToWorld(cam, { x: width, y: height });
  return {
    minX: topLeft.x,
    minY: topLeft.y,
    maxX: bottomRight.x,
    maxY: bottomRight.y,
  };
}
