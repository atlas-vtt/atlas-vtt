import { isRecord } from './shape.ts';
import { COLOUR_PATTERN, MAX_COORDINATE, TOKEN_ID_PATTERN } from './tokens.ts';

/** The surfaces one floor may show, as many as Atlas reads of a level. */
export const MAX_SHARED_LIQUIDS = 256;
/** The corners one surface may have, its holes' included, as Atlas reads them. */
export const MAX_SHARED_LIQUID_CORNERS = 2048;
/**
 * The corners of all surfaces of one message together: what its parts can carry at two decimals and
 * then some. A generated lake has a few hundred.
 */
export const MAX_SHARED_LIQUID_TOTAL = 262_144;

export const SHARED_LIQUID_KINDS = ['water', 'lava', 'acid'] as const;
export type SharedLiquidKind = (typeof SHARED_LIQUID_KINDS)[number];

/** The colours a surface moves in, `#rrggbb`. */
export interface SharedLiquidColours {
  readonly surface: string;
  readonly deep: string;
  readonly glint: string;
}

/**
 * Water, lava or acid that moves on the map, drawn over the map image and under lighting and fog like
 * the map itself: it shows nothing the map does not. `id` is a random alias, the same while the scene
 * stands; corners are flat `[x0, y0, …]` in world pixels, `holes` what stands dry inside, `flow` the
 * unit direction it flows (absent: it stands still), `art` the engraved looks' ink, and `glow` an alias
 * the pieces of lava that glow with one light share, so they smoulder as one.
 */
export interface SharedLiquid {
  readonly id: string;
  readonly liquid: SharedLiquidKind;
  readonly polygon: readonly number[];
  readonly holes?: readonly (readonly number[])[];
  readonly flow?: { readonly x: number; readonly y: number };
  readonly colours: SharedLiquidColours;
  readonly art?: 'engraved';
  readonly glow?: string;
}

const isCoordinate = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= MAX_COORDINATE;

/** Whether flat corners enclose an area: three or more, every one on the map, not all on one line. */
export function isLiquidArea(value: unknown): value is number[] {
  if (!Array.isArray(value) || value.length % 2 !== 0 || value.length < 6 || value.length > MAX_SHARED_LIQUID_CORNERS * 2 || !value.every(isCoordinate)) return false;
  let twice = 0;
  for (let i = 0; i < value.length; i += 2) {
    const j = (i + 2) % value.length;
    twice += (value[i] as number) * (value[j + 1] as number) - (value[j] as number) * (value[i + 1] as number);
  }
  return Math.abs(twice) > 1e-6;
}

/** A direction of unit length, or none for one that is no direction. */
function readFlow(value: unknown): { x: number; y: number } | undefined {
  if (!isRecord(value) || typeof value.x !== 'number' || typeof value.y !== 'number') return undefined;
  const length = Math.hypot(value.x, value.y);
  return length > 1e-6 && Number.isFinite(length) ? { x: value.x / length, y: value.y / length } : undefined;
}

function readColours(value: unknown): SharedLiquidColours | null {
  if (!isRecord(value)) return null;
  const { surface, deep, glint } = value;
  const colour = (part: unknown): part is string => typeof part === 'string' && COLOUR_PATTERN.test(part);
  return colour(surface) && colour(deep) && colour(glint) ? { surface, deep, glint } : null;
}

/** The holes that are areas, as long as all corners of the surface stay within the limit. */
function readHoles(value: unknown, corners: number): number[][] {
  if (!Array.isArray(value)) return [];
  const holes: number[][] = [];
  let total = corners;
  for (const hole of value) {
    if (!isLiquidArea(hole)) continue;
    total += hole.length / 2;
    if (total > MAX_SHARED_LIQUID_CORNERS) break;
    holes.push(hole);
  }
  return holes;
}

/** A surface, or null for one that is no area, of no kind players know, or without its colours. */
function parseLiquid(value: unknown): SharedLiquid | null {
  if (!isRecord(value) || typeof value.id !== 'string' || !TOKEN_ID_PATTERN.test(value.id) || !isLiquidArea(value.polygon)) return null;
  const liquid = SHARED_LIQUID_KINDS.find((kind) => kind === value.liquid);
  const colours = readColours(value.colours);
  if (liquid === undefined || colours === null) return null;
  const holes = readHoles(value.holes, value.polygon.length / 2);
  const flow = readFlow(value.flow);
  return {
    id: value.id,
    liquid,
    polygon: value.polygon,
    ...(holes.length > 0 && { holes }),
    ...(flow !== undefined && { flow }),
    colours,
    ...(value.art === 'engraved' && { art: 'engraved' as const }),
    ...(liquid === 'lava' && typeof value.glow === 'string' && TOKEN_ID_PATTERN.test(value.glow) && { glow: value.glow }),
  };
}

/** The number of corners of a surface, its holes' included. */
export const liquidCorners = (liquid: Pick<SharedLiquid, 'polygon' | 'holes'>): number => (liquid.polygon.length + (liquid.holes ?? []).reduce((sum, hole) => sum + hole.length, 0)) / 2;

/**
 * The surfaces of a floor in drawing order (a later one lies over an earlier one): those that can be
 * read, each id once, as long as all corners stay within `MAX_SHARED_LIQUID_TOTAL`; null for a list
 * that is none or longer than `MAX_SHARED_LIQUIDS`.
 */
export function parseLiquids(value: unknown): SharedLiquid[] | null {
  if (!Array.isArray(value) || value.length > MAX_SHARED_LIQUIDS) return null;
  const liquids: SharedLiquid[] = [];
  const ids = new Set<string>();
  let total = 0;
  for (const entry of value) {
    const liquid = parseLiquid(entry);
    if (liquid === null || ids.has(liquid.id)) continue;
    total += liquidCorners(liquid);
    if (total > MAX_SHARED_LIQUID_TOTAL) break;
    ids.add(liquid.id);
    liquids.push(liquid);
  }
  return liquids;
}
