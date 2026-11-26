import type { WallSegment } from '../types/wallTypes';

type WallRecord = Record<string, WallSegment>;

/** Scenes whose walls record is kept, the most recently used last. */
const KEPT_SCENES = 4;
const kept = new Map<string, WallRecord>();

/**
 * Notes the walls record a scene's store holds, as it is saved to `path`. Reading the scene again
 * gives that very record back (`asKeptWalls`) while the file holds the same walls, so whatever is
 * worked out from a walls record and kept by its identity (sealed walls, sweep grids, light reaches,
 * sight) is found again when the GM switches back to the scene, instead of being built anew.
 */
export function keepSceneWalls(path: string, walls: WallRecord): void {
  if (kept.get(path) === walls) return;
  kept.delete(path);
  kept.set(path, walls);
  if (kept.size > KEPT_SCENES) kept.delete(kept.keys().next().value!);
}

/** The record kept for `path` where it holds exactly what `walls` holds (`sameData`), else `walls`. */
export function asKeptWalls(path: string, walls: WallRecord): WallRecord {
  const known = kept.get(path);
  return known && sameData(known, walls) ? known : walls;
}

/**
 * Whether two values read from or written to a scene file are the same data: the same keys in the
 * same order (the order walls are listed and swept in), and equal values by `Object.is`.
 */
export function sameData(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null || Array.isArray(a) !== Array.isArray(b)) return false;
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  for (let i = 0; i < keysA.length; i++) {
    const key = keysA[i]!;
    if (key !== keysB[i] || !sameData((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key])) return false;
  }
  return true;
}
