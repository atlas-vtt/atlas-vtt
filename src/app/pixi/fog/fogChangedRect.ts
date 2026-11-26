/**
 * Where on the fog's canvas a change of the fog shows. Outside it the canvas holds the same
 * before and after, so a fade keeps only that part of the picture before it.
 */
import type { FogBounds, FogOperation } from '../../types/fogTypes';
import { calculateOperationBounds } from './fogRenderUtils';

type Operations = Readonly<Record<string, FogOperation>>;

/** A box in world space; unbounded where its sides are infinite. */
export interface WorldBox {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** A box of whole canvas pixels. */
export interface CanvasRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The fog's canvas, as a change is placed on it. */
export interface FogCanvasFrame {
  /** The world area the canvas covers. */
  readonly bounds: FogBounds;
  /** Canvas pixels per world pixel. */
  readonly scale: number;
  readonly width: number;
  readonly height: number;
  /** How far the fog's edge carries a change beyond its outline, in world pixels; 0 for a hard edge. */
  readonly reach: number;
  /** The map image in world space, past whose edge a fog with an edge is repeated; null without one. */
  readonly map: FogBounds | null;
}

/**
 * The most canvas pixels a fade keeps of the picture before it: the whole fog of an 8,192 px map.
 * A canvas and a texture of that size take about 10 ms to make and 150 MB while the fade runs; a
 * change that reaches further shows at once.
 */
export const MAX_FADED_PIXELS = 4296 * 4296;

/** Canvas pixels around a change: its antialiased rim, and the ring of the kept picture that is never read. */
const GUARD = 3;

const EVERYWHERE: WorldBox = { left: -Infinity, top: -Infinity, right: Infinity, bottom: Infinity };

/**
 * The box around every operation the two records do not share: one added, one gone, one replaced
 * by another version of itself. Fog is replayed operation by operation, so outside that box both
 * records give the same fog. Null where they share every operation; unbounded where one of those
 * they do not share cannot be read.
 */
export function changedFogBox(before: Operations, after: Operations): WorldBox | null {
  const box: WorldBox = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity };
  let changed = false;
  const add = (operation: FogOperation): void => {
    const { x, y, width, height } = calculateOperationBounds(operation);
    if (![x, y, width, height].every(Number.isFinite)) throw new RangeError('Fog operation without bounds');
    box.left = Math.min(box.left, x);
    box.top = Math.min(box.top, y);
    box.right = Math.max(box.right, x + width);
    box.bottom = Math.max(box.bottom, y + height);
    changed = true;
  };
  try {
    for (const [id, operation] of Object.entries(after)) {
      const was = Object.hasOwn(before, id) ? before[id] : undefined;
      if (was === operation) continue;
      add(operation);
      if (was) add(was);
    }
    for (const [id, operation] of Object.entries(before)) {
      if (!Object.hasOwn(after, id)) add(operation);
    }
  } catch {
    return EVERYWHERE;
  }
  return changed ? box : null;
}

/**
 * The canvas pixels a change within `box` can show in: the box with the reach of the fog's edge
 * and a rim around it. A fog with an edge repeats what lies at the map's edge out to the canvas'
 * (`drawWithSpreadEdges`), so a change that reaches the map's edge reaches the canvas' on that
 * side. Null where the change lies off the canvas.
 */
export function changedCanvasRect(box: WorldBox, frame: FogCanvasFrame): CanvasRect | null {
  const { bounds, scale, width, height, reach, map } = frame;
  const pad = Math.ceil(reach * scale) + GUARD;
  let left = Math.floor((box.left - bounds.x) * scale) - pad;
  let top = Math.floor((box.top - bounds.y) * scale) - pad;
  let right = Math.ceil((box.right - bounds.x) * scale) + pad;
  let bottom = Math.ceil((box.bottom - bounds.y) * scale) + pad;
  if (reach > 0 && map) {
    if (left <= Math.ceil((map.x - bounds.x) * scale)) left = 0;
    if (top <= Math.ceil((map.y - bounds.y) * scale)) top = 0;
    if (right >= Math.floor((map.x + map.width - bounds.x) * scale)) right = width;
    if (bottom >= Math.floor((map.y + map.height - bounds.y) * scale)) bottom = height;
  }
  left = Math.max(0, left);
  top = Math.max(0, top);
  right = Math.min(width, right);
  bottom = Math.min(height, bottom);
  return right > left && bottom > top ? { x: left, y: top, width: right - left, height: bottom - top } : null;
}

/** The smallest box of canvas pixels that holds both. */
export function unitedCanvasRect(a: CanvasRect, b: CanvasRect): CanvasRect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, width: Math.max(a.x + a.width, b.x + b.width) - x, height: Math.max(a.y + a.height, b.y + b.height) - y };
}
