/**
 * What keeps auras and grouped measurements with their tokens in a scene's objects: they go when
 * their token goes, and lie on the level their token stands on. Called by the store's own writes that delete tokens or
 * move them between levels, inside the same write, so undo brings back both and takes both back.
 * A copied or duplicated token gets no aura: an aura belongs to the token it was given to.
 */

import { isRecord } from '../utils/guards';
import { followedToken } from './keptMeasures';

/** A scene's objects, as far as auras go: the kept measurements and the tokens they may follow. */
export interface AuraHolder {
  measures?: Record<string, unknown> | undefined;
  tokens: Record<string, { level?: string | undefined } | undefined>;
}

/**
 * The ids of the auras of `tokenIds` (with `grouped`, of every measurement that follows them), in
 * the order they were kept. What follows a token is the reader's to say (`followedToken`): an entry
 * that names a token and is read as a plain measurement is none, and stays whatever becomes of that token.
 */
export function aurasOf(measures: Readonly<Record<string, unknown>> | undefined, tokenIds: ReadonlySet<string>, grouped = false): string[] {
  if (!isRecord(measures) || tokenIds.size === 0) return [];
  return Object.keys(measures).filter((id) => {
    const bearer = followedToken(id, measures[id], grouped);
    return bearer !== null && tokenIds.has(bearer);
  });
}

/** Removes the auras and grouped measurements of the tokens `tokenIds`, which are gone, from `objects` (a store draft); returns their ids. */
export function dropAurasOf(objects: AuraHolder, tokenIds: Iterable<string>): string[] {
  const { measures } = objects;
  const gone = aurasOf(measures, new Set(tokenIds), true);
  if (measures) {
    for (const id of gone) delete measures[id];
  }
  return gone;
}

/** Puts the auras and grouped measurements of the tokens `tokenIds` on the level each token stands on now, in `objects` (a store draft). */
export function aurasToTokenLevels(objects: AuraHolder, tokenIds: Iterable<string>): void {
  const { measures, tokens } = objects;
  for (const id of aurasOf(measures, new Set(tokenIds), true)) {
    const measure = measures?.[id];
    const bearer = followedToken(id, measure);
    if (!isRecord(measure) || bearer === null) continue;
    const level = tokens[bearer]?.level;
    if (measure.level === level) continue;
    if (level === undefined) delete measure.level;
    else measure.level = level;
  }
}
