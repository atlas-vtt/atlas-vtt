import type { SceneLevel } from '../types/sceneLevelTypes';
import { isFiniteNumber, isRecord } from '../utils/guards';
import { readExploredMask } from '../lighting/exploredMaskCodec';
import type { SceneLevels } from './sceneLevels';
import { readLevelAlignment, type LevelAlignments } from './levelAlignment';

/** The version of a scene file written by every Atlas since files had versions, and of every scene with one level. */
export const SINGLE_LEVEL_FILE_VERSION = 4;
/**
 * The version of a scene with more than one level. Older Atlas versions keep only the keys they
 * know when they save, so they would drop the levels and show every floor's walls and tokens over
 * the first floor's map; from 0.7.0 on they refuse a newer file instead of loading it.
 */
export const LEVELS_FILE_VERSION = 5;

const text = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null);

/** A level's elevation as the file has it; what is not a range of numbers starts and ends at its bottom. */
function readElevation(value: unknown): SceneLevel['elevation'] {
  const bottom = isRecord(value) && isFiniteNumber(value.bottom) ? value.bottom : 0;
  const top = isRecord(value) && isFiniteNumber(value.top) && value.top >= bottom ? value.top : bottom;
  return { bottom, top };
}

function readOffset(value: unknown): SceneLevel['offset'] {
  return isRecord(value) && isFiniteNumber(value.x) && isFiniteNumber(value.y) ? { x: value.x, y: value.y } : undefined;
}

/** One level as the file has it, or null where it names no level. Fields Atlas does not know stay as they are. */
function readLevel(value: unknown): SceneLevel | null {
  if (!isRecord(value)) return null;
  const id = text(value.id);
  if (!id) return null;
  const { name, foreground, sees, offset, alignment, openArt, ...rest } = value;
  const readAlignment = readLevelAlignment(alignment);
  const readSees = Array.isArray(sees) ? sees.filter((entry): entry is string => typeof entry === 'string') : undefined;
  const readOff = readOffset(offset);
  return {
    ...rest,
    id,
    // A blank name is none, as `withLevelChanged` keeps it
    ...(typeof name === 'string' && name.trim() !== '' && { name }),
    elevation: readElevation(value.elevation),
    background: text(value.background),
    ...(foreground !== undefined && { foreground: text(foreground) }),
    ...(readSees && { sees: readSees }),
    ...(openArt === false && { openArt: false as const }),
    ...(readOff && { offset: readOff }),
    ...(readAlignment && { alignment: readAlignment }),
  };
}

/**
 * The scene's levels as its file has them, bottom first; undefined for a scene without levels.
 * Entries that name no level, or repeat an id, are left out. The first level's background is the
 * scene's own (`background`), which every version reads.
 */
export function readSceneLevels(value: unknown, background: string | null): SceneLevel[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const seen = new Set<string>();
  const levels: SceneLevel[] = [];
  for (const entry of value) {
    const level = readLevel(entry);
    if (!level || seen.has(level.id)) continue;
    seen.add(level.id);
    levels.push(level);
  }
  const [first, ...rest] = levels;
  return first ? [{ ...first, background }, ...rest] : undefined;
}

/** The explored memories of the levels above the first, by level id; the first level's is `exploredMask`. */
export function readExploredMasks(value: unknown, levels: SceneLevels): Record<string, string> | undefined {
  if (!isRecord(value) || !levels) return undefined;
  const masks: Record<string, string> = {};
  for (const level of levels.slice(1)) {
    const mask = readExploredMask(value[level.id]);
    if (mask) masks[level.id] = mask;
  }
  return Object.keys(masks).length > 0 ? masks : undefined;
}

/**
 * The version a scene's file is written with: 5 with more than one level, or a level whose image an
 * alignment of its own draws (a map image replaced by one of another size), which an older Atlas
 * would draw at its own size under the grid; else 4, so plain scenes open in older versions too.
 */
export function sceneFileVersion(levels: unknown): number {
  if (!Array.isArray(levels)) return SINGLE_LEVEL_FILE_VERSION;
  const aligned = levels.some((level) => isRecord(level) && level.alignment !== undefined);
  return levels.length > 1 || aligned ? LEVELS_FILE_VERSION : SINGLE_LEVEL_FILE_VERSION;
}

const forFile = new WeakMap<readonly SceneLevel[], { background: string | null; alignments: LevelAlignments | undefined; levels: SceneLevel[] }>();

/**
 * `levels` as the file holds them: the first level's background set to the scene's, and each
 * level's alignment (`alignments`, kept beside the levels in memory) inside it. The same list where
 * nothing is to be added, and the same copy for as long as the three stay, so a save compares equal.
 */
export function levelsForFile(levels: SceneLevel[] | undefined, background: string | null, alignments?: LevelAlignments): SceneLevel[] | undefined {
  const [first] = levels ?? [];
  if (!levels || !first) return levels;
  if (first.background === background && !alignments) return levels;
  const known = forFile.get(levels);
  if (known?.background === background && known.alignments === alignments) return known.levels;
  const copy = levels.map((level, index) => {
    const alignment = alignments?.[level.id];
    return { ...level, ...(index === 0 && { background }), ...(alignment && { alignment }) };
  });
  forFile.set(levels, { background, alignments, levels: copy });
  return copy;
}

/** `levels` with the first level's background set to the scene's; the same list where it already is. */
export function levelsWithBackground(levels: SceneLevel[] | undefined, background: string | null): SceneLevel[] | undefined {
  const [first, ...rest] = levels ?? [];
  if (!levels || !first || first.background === background) return levels;
  return [{ ...first, background }, ...rest];
}

/**
 * Every map image a scene's file shows, once each: the scene's background, which is the first
 * level's, and each level's background and foreground. Reads the file's shape as it is, so a
 * snapshot or a scene of a newer version is read the same way.
 */
export function sceneImagePaths(state: { background?: unknown; levels?: unknown }): string[] {
  const paths = new Set<string>();
  const add = (value: unknown): void => {
    const path = text(value);
    if (path) paths.add(path);
  };
  add(state.background);
  if (Array.isArray(state.levels)) {
    for (const level of state.levels) {
      if (!isRecord(level)) continue;
      add(level.background);
      add(level.foreground);
    }
  }
  return [...paths];
}
