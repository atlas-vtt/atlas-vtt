/** The world area the fog's canvas covers. */
import type { MapRect } from '../../grid/cellNumbering';
import { validateFogOperation } from '../../fog/fogOperationShape';
import type { FogBounds, FogOperation } from '../../types/fogTypes';
import { calculateOperationBounds } from './fogRenderUtils';

const DEFAULT_BOUNDS: FogBounds = { x: -2000, y: -2000, width: 4000, height: 4000 };
/** Room around the map or the painted fog, so a stroke may run past its edge. */
const BOUNDS_PADDING = 200;
/** A change smaller than this keeps the canvas it has. */
const BOUNDS_SLACK = 10;

/**
 * The map image with room around it; without one (none loaded yet), what was painted, or a
 * default area.
 */
export function fogCanvasBounds(mapRect: MapRect | null, fog: Readonly<Record<string, FogOperation>> | undefined): FogBounds {
  const chosen = mapRect ?? paintedBounds(fog);
  if (!chosen) return DEFAULT_BOUNDS;
  return {
    x: chosen.x - BOUNDS_PADDING,
    y: chosen.y - BOUNDS_PADDING,
    width: chosen.width + BOUNDS_PADDING * 2,
    height: chosen.height + BOUNDS_PADDING * 2,
  };
}

/** Whether `next` differs from `current` by enough to size the canvas anew. */
export function fogBoundsChanged(next: FogBounds, current: FogBounds): boolean {
  return Math.abs(next.x - current.x) > BOUNDS_SLACK
    || Math.abs(next.y - current.y) > BOUNDS_SLACK
    || Math.abs(next.width - current.width) > BOUNDS_SLACK
    || Math.abs(next.height - current.height) > BOUNDS_SLACK;
}

/** The box around everything that hides; null without any, and for geometry that cannot be read. */
function paintedBounds(fog: Readonly<Record<string, FogOperation>> | undefined): FogBounds | null {
  if (!fog) return null;
  const ops = Object.values(fog);
  try {
    ops.forEach(validateFogOperation);
  } catch {
    // The default area lets invalid saved geometry reach the opaque fallback.
    return null;
  }

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const op of ops) {
    if (op.isErasing) continue;
    const bounds = calculateOperationBounds(op);
    if (bounds.width <= 0 || bounds.height <= 0) continue;
    minX = Math.min(minX, bounds.x);
    minY = Math.min(minY, bounds.y);
    maxX = Math.max(maxX, bounds.x + bounds.width);
    maxY = Math.max(maxY, bounds.y + bounds.height);
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) return null;
  return { x: minX, y: minY, width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY) };
}
