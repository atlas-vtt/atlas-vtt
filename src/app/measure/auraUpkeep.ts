/**
 * What keeps auras with their tokens in a scene's objects: an aura goes when its token goes, and
 * lies on the level its token stands on. Called by the store's own writes that delete tokens or
 * move them between levels, inside the same write, so undo brings back both and takes both back.
 * A copied or duplicated token gets no aura: an aura belongs to the token it was given to.
 */

import { isRecord } from '../utils/guards';

/** A scene's objects, as far as auras go: the kept measurements and the tokens they may follow. */
export interface AuraHolder {
  measures?: Record<string, unknown> | undefined;
  tokens: Record<string, { level?: string | undefined } | undefined>;
}

/** The ids of the kept measurements that follow one of `tokenIds`, in the order they were kept. */
export function aurasOf(measures: Readonly<Record<string, unknown>> | undefined, tokenIds: ReadonlySet<string>): string[] {
  if (!isRecord(measures) || tokenIds.size === 0) return [];
  return Object.keys(measures).filter((id) => {
    const measure = measures[id];
    return isRecord(measure) && typeof measure.follows === 'string' && tokenIds.has(measure.follows);
  });
}

/** Removes the auras of the tokens `tokenIds`, which are gone, from `objects` (a store draft); returns their ids. */
export function dropAurasOf(objects: AuraHolder, tokenIds: Iterable<string>): string[] {
  const { measures } = objects;
  const gone = aurasOf(measures, new Set(tokenIds));
  if (measures) {
    for (const id of gone) delete measures[id];
  }
  return gone;
}

/** Puts the auras of the tokens `tokenIds` on the level each token stands on now, in `objects` (a store draft). */
export function aurasToTokenLevels(objects: AuraHolder, tokenIds: Iterable<string>): void {
  const { measures, tokens } = objects;
  for (const id of aurasOf(measures, new Set(tokenIds))) {
    const measure = measures?.[id];
    if (!isRecord(measure) || typeof measure.follows !== 'string') continue;
    const level = tokens[measure.follows]?.level;
    if (measure.level === level) continue;
    if (level === undefined) delete measure.level;
    else measure.level = level;
  }
}
