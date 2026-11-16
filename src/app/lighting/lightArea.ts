import type { LightChanges, LightSource } from '../types/lightingTypes';
import type { Point } from '../types/visionTypes';
import { isRecord } from '../utils/guards';
import { hasArea } from '../vision/polygonArea';

/**
 * Lights that glow from a whole area (`LightSource.area`), like lava: what an area is, where it
 * lies and how it moves with its light.
 */

/**
 * The corners an area light may have. Lava outlines follow the grid's cells, so they have many;
 * the engine reads an outline from a list of this length (two corners to a vec4, well within the
 * uniforms every WebGL 2 device offers) for every texel of the light's tile when it is traced.
 */
export const MAX_AREA_CORNERS = 256;

function isPoint(value: unknown): value is Point {
  return isRecord(value) && typeof value.x === 'number' && typeof value.y === 'number' && Number.isFinite(value.x) && Number.isFinite(value.y);
}

/** The area a light's `area` field describes: three to `MAX_AREA_CORNERS` corners that are numbers and enclose an area; null for anything else. */
export function readArea(value: unknown): Point[] | null {
  if (!Array.isArray(value) || value.length < 3 || value.length > MAX_AREA_CORNERS || !value.every(isPoint)) return null;
  return hasArea(value) ? value : null;
}

/** The smallest upright rectangle around an area: `[x, y, width, height]`. */
export function areaBounds(area: readonly Point[]): [number, number, number, number] {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const { x, y } of area) {
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  }
  return [x0, y0, x1 - x0, y1 - y0];
}

/** How far the area's farthest corner lies from `middle`. */
export function areaRadius(area: readonly Point[], middle: Point): number {
  let radius = 0;
  for (const corner of area) radius = Math.max(radius, Math.hypot(corner.x - middle.x, corner.y - middle.y));
  return radius;
}

/** The changes that put `light` at (x, y): an area light's area moves along with its middle. */
export function lightMovedTo(light: Pick<LightSource, 'x' | 'y' | 'area'>, x: number, y: number): LightChanges {
  const { area } = light;
  if (!area) return { x, y };
  const dx = x - light.x, dy = y - light.y;
  return { x, y, area: area.map((corner) => ({ x: corner.x + dx, y: corner.y + dy })) };
}
