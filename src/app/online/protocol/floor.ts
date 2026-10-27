import { shownLine } from './chat.ts';
import { isRecord } from './shape.ts';

/** The longest name of a floor players are shown, in characters. */
export const MAX_FLOOR_NAME = 80;
/** The highest place a floor may have among its scene's floors. */
export const MAX_FLOOR_LEVEL = 1000;
const MAX_GROUP_ID = 64;

/**
 * Which floor of a scene with several floors a shared scene is: each floor goes to the players whose
 * token stands on it as a scene of its own. The floors of one map share `group` (random per map), so
 * a page can tell another floor of the same map, lying at the same world places, from another map.
 * `level` is the floor's place from the bottom (higher is up) and `name` what the GM calls it.
 * Added later: an older GM names no floor, and an older page reads each floor as a scene.
 */
export interface SharedFloor {
  readonly group: string;
  readonly level: number;
  readonly name: string;
}

/** A floor as the page reads it, or undefined for anything malformed. */
export function parseFloor(value: unknown): SharedFloor | undefined {
  if (!isRecord(value)) return undefined;
  const { group, level } = value;
  const name = shownLine(value.name, MAX_FLOOR_NAME);
  if (typeof group !== 'string' || group.length === 0 || group.length > MAX_GROUP_ID || name === null) return undefined;
  if (typeof level !== 'number' || !Number.isInteger(level) || level < 0 || level > MAX_FLOOR_LEVEL) return undefined;
  return { group, level, name };
}

/** Whether two shared scenes are floors of the same map: both name a floor of one group. */
export function sameMapFloors(a: { readonly floor?: SharedFloor } | null, b: { readonly floor?: SharedFloor } | null): boolean {
  return a?.floor !== undefined && a.floor.group === b?.floor?.group;
}
