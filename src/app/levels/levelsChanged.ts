import type { SceneLevel } from '../types/sceneLevelTypes';
import type { LevelAlignments } from './levelAlignment';
import { firstLevelId, isLevelOf, onLevel } from './sceneLevels';

/** What `levelsChanged` compares of a scene: its objects by kind and the alignments of its levels. */
export interface LevelChangeScene {
  objects: object;
  levelAlignments?: LevelAlignments | undefined;
}

type AnyRecord = Record<string, unknown>;

const recordOf = (value: unknown): AnyRecord => (typeof value === 'object' && value !== null ? value as AnyRecord : {});

/** The levels `entry` stands on; an entry that is no object is read where unset objects are, on the first. */
function levelsOf(entry: unknown, levels: readonly SceneLevel[]): string[] {
  if (typeof entry !== 'object' || entry === null) return [firstLevelId(levels) ?? ''];
  return levels.filter((level) => onLevel(entry, level.id, levels)).map((level) => level.id);
}

/**
 * The levels on which `after` differs from `before`, bottom first: where an object was added,
 * removed or changed (on the levels it stood on and stands on), or a level's alignment changed.
 * Compares references only, as history does, so it costs nothing for kinds a write left alone.
 */
export function levelsChanged(before: LevelChangeScene, after: LevelChangeScene, levels: readonly SceneLevel[]): string[] {
  const touched = new Set<string>();
  const kinds = new Set([...Object.keys(before.objects), ...Object.keys(after.objects)]);
  for (const kind of kinds) {
    const old = recordOf((before.objects as AnyRecord)[kind]);
    const now = recordOf((after.objects as AnyRecord)[kind]);
    if (old === now) continue;
    for (const id of new Set([...Object.keys(old), ...Object.keys(now)])) {
      if (old[id] === now[id]) continue;
      for (const entry of [old[id], now[id]]) {
        if (entry !== undefined) for (const level of levelsOf(entry, levels)) touched.add(level);
      }
    }
  }
  if (before.levelAlignments !== after.levelAlignments) {
    for (const id of new Set([...Object.keys(before.levelAlignments ?? {}), ...Object.keys(after.levelAlignments ?? {})])) {
      if (before.levelAlignments?.[id] !== after.levelAlignments?.[id] && isLevelOf(levels, id)) touched.add(id);
    }
  }
  return levels.filter((level) => touched.has(level.id)).map((level) => level.id);
}
