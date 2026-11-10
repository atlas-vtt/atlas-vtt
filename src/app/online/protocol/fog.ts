import { isRecord } from './shape.ts';
import { TOKEN_ID_PATTERN } from './tokens.ts';

/** Fog operations one message may carry. */
export const MAX_FOG_OPERATIONS = 5_000;
/** Points (x and y each count once) all operations of one message may carry together. */
export const MAX_FOG_POINTS = 1_000_000;
/** How far from the map's origin fog may reach, in world pixels. */
export const MAX_FOG_COORDINATE = 1_000_000;

/**
 * One fog operation as players get it: its geometry with the GM's drag offset applied, in world
 * pixels, and whether it paints or erases. Points are flat `[x0, y0, x1, y1, …]`. `id` is random,
 * one per operation for as long as the scene is shared, so that deltas can name it (an older
 * companion sends none, and its fog goes out whole).
 */
export type SharedFogOperation = { readonly id?: string } & (
  | { readonly type: 'brush'; readonly erase: boolean; readonly points: readonly number[]; readonly radius: number }
  | { readonly type: 'lasso'; readonly erase: boolean; readonly points: readonly number[] }
  | { readonly type: 'rectangle'; readonly erase: boolean; readonly x: number; readonly y: number; readonly width: number; readonly height: number });

/**
 * The scene's committed fog, in the order it is replayed (the first first). `null` says the GM's
 * fog cannot be read: the client covers the whole map, as the GM's own player frame does.
 */
export type SharedFog = readonly SharedFogOperation[] | null;

const isCoordinate = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= MAX_FOG_COORDINATE;

function parsePoints(value: unknown, budget: { left: number }): number[] | null {
  if (!Array.isArray(value) || value.length % 2 !== 0 || value.length > budget.left || !value.every(isCoordinate)) return null;
  budget.left -= value.length;
  return value;
}

function parseOperation(value: unknown, budget: { left: number }): SharedFogOperation | null {
  if (!isRecord(value) || typeof value.erase !== 'boolean') return null;
  const { erase, id } = value;
  if (id !== undefined && (typeof id !== 'string' || !TOKEN_ID_PATTERN.test(id))) return null;
  const named = id === undefined ? {} : { id };
  if (value.type === 'rectangle') {
    const { x, y, width, height } = value;
    return isCoordinate(x) && isCoordinate(y) && isCoordinate(width) && isCoordinate(height) ? { ...named, type: 'rectangle', erase, x, y, width, height } : null;
  }
  const points = parsePoints(value.points, budget);
  if (points === null) return null;
  if (value.type === 'lasso') return { ...named, type: 'lasso', erase, points };
  return value.type === 'brush' && isCoordinate(value.radius) && value.radius >= 0 ? { ...named, type: 'brush', erase, points, radius: value.radius } : null;
}

/** The fog of a `fog` message, or undefined when it or any operation in it is malformed. */
export function parseFog(value: unknown): SharedFog | undefined {
  if (value === null) return null;
  if (!Array.isArray(value) || value.length > MAX_FOG_OPERATIONS) return undefined;
  const budget = { left: MAX_FOG_POINTS };
  const operations: SharedFogOperation[] = [];
  for (const entry of value) {
    const operation = parseOperation(entry, budget);
    if (operation === null) return undefined;
    operations.push(operation);
  }
  return operations;
}
