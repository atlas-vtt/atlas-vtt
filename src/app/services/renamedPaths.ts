import { normalizeImagePath } from '../utils/pathUtils';

/** A file that now lives at `to` instead of `from`. */
export interface PathMove {
  from: string;
  to: string;
}

/** Looks up where a stored path moved to, or null when it did not move. */
export type MovedPath = (candidate: string | null | undefined) => string | null;

/** Where stored paths go after `moves`; stored paths match in raw or normalized form. */
export function movedPathOf(moves: readonly PathMove[]): MovedPath {
  const targets = new Map<string, string>();
  for (const { from, to } of moves) {
    if (normalizeImagePath(from) !== normalizeImagePath(to)) targets.set(normalizeImagePath(from), to);
  }
  return (candidate) => (candidate ? targets.get(normalizeImagePath(candidate)) ?? null : null);
}

/**
 * Where stored paths go after folders moved: a path at or below a moved folder moves with it, as
 * a pin's folder of encounters does. Files inside get their own moves; this reaches what names a
 * folder.
 */
export function movedFolderPathOf(moves: readonly PathMove[]): MovedPath {
  return (candidate) => {
    if (!candidate) return null;
    for (const { from, to } of moves) {
      if (from === to) continue;
      if (candidate === from) return to;
      if (candidate.startsWith(`${from}/`)) return `${to}${candidate.slice(from.length)}`;
    }
    return null;
  };
}

/** A pin target (`path` or `path#heading`) after the moves, or null when its file did not move. */
function movedPinTarget(target: string, moved: MovedPath): string | null {
  const hash = target.indexOf('#');
  const path = moved(hash === -1 ? target : target.slice(0, hash));
  return path === null ? null : path + (hash === -1 ? '' : target.slice(hash));
}

interface TokenPaths {
  imagePath?: string | undefined;
  statblockPath?: string | null | undefined;
}

interface PinPaths {
  notePath?: string | undefined;
}

interface LevelPaths {
  background?: string | null | undefined;
  foreground?: string | null | undefined;
}

interface DiceSourcePaths {
  tokenImagePath?: string | undefined;
  statblockPath?: string | undefined;
}

type Collection<T> = Record<string, T> | readonly T[] | null | undefined;

/** The parts of a map that point at vault files, in a saved map file or a live store draft. */
export interface MapReferences {
  /** The map's own file, which the saved state repeats. */
  mapPath?: string | null | undefined;
  /** The map image the scene is drawn on: its first level's. */
  background?: string | null | undefined;
  /** The scene's levels, each with a map image of its own. */
  levels?: Collection<LevelPaths | null | undefined>;
  objects?: {
    tokens?: Collection<TokenPaths>;
    pins?: Collection<PinPaths>;
  } | null | undefined;
  initiative?: { entries?: Collection<TokenPaths> } | null | undefined;
  diceLog?: Collection<{ source?: DiceSourcePaths | null | undefined }>;
}

/** Sets `record[key]` to its moved path; returns whether it moved. */
function follow<K extends string>(record: Partial<Record<K, string | null | undefined>>, key: K, moved: MovedPath): boolean {
  const target = moved(record[key]);
  if (target === null) return false;
  record[key] = target;
  return true;
}

/**
 * Points everything a map refers to at the new places of moved files, in
 * place: its own path, the background of every level, token art and statblocks, pin
 * targets, and the portraits and statblocks of initiative entries and dice
 * rolls. Returns whether anything changed.
 */
export function rewriteMapReferences(map: MapReferences | null | undefined, moved: MovedPath): boolean {
  if (!map) return false;
  let changed = follow(map, 'mapPath', moved);
  changed = follow(map, 'background', moved) || changed;
  for (const level of Object.values(map.levels ?? {})) {
    if (!level) continue;
    changed = follow(level, 'background', moved) || changed;
    changed = follow(level, 'foreground', moved) || changed;
  }
  const tokenLike = [...Object.values(map.objects?.tokens ?? {}), ...Object.values(map.initiative?.entries ?? {})];
  for (const token of tokenLike) {
    changed = follow(token, 'imagePath', moved) || changed;
    changed = follow(token, 'statblockPath', moved) || changed;
  }
  for (const pin of Object.values(map.objects?.pins ?? {})) {
    const target = pin.notePath ? movedPinTarget(pin.notePath, moved) : null;
    if (target !== null) {
      pin.notePath = target;
      changed = true;
    }
  }
  for (const { source } of Object.values(map.diceLog ?? {})) {
    if (!source) continue;
    changed = follow(source, 'tokenImagePath', moved) || changed;
    changed = follow(source, 'statblockPath', moved) || changed;
  }
  return changed;
}
