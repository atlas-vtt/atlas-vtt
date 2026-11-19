import type { ToldMeasure } from './measureWords.ts';
import { sameTold } from './toldMeasures.ts';

/** What a sender's kept measurements told anew are drawn with. */
export interface KeptMatch<K> {
  /** For each told measurement in order, the drawing of the same one, or null for one that is new. */
  readonly drawings: readonly (K | null)[];
  /** The drawings of measurements told no more. */
  readonly gone: readonly K[];
}

/**
 * Matches told measurements to the drawings a sender has. Told as many as before, each is the one
 * in its place, perhaps edited (a measurement moved or resized). Told more or fewer, measurements
 * came or went: each keeps the drawing of the same one (`sameTold`), wherever it stood, so the one
 * deleted is the one that goes and those that stay are not drawn anew.
 */
export function matchKept<K extends { readonly told: ToldMeasure }>(drawings: readonly K[], told: readonly ToldMeasure[]): KeptMatch<K> {
  if (drawings.length === told.length) return { drawings, gone: [] };
  const left = [...drawings];
  const matched = told.map((measure) => {
    const at = left.findIndex((drawing) => sameTold(drawing.told, measure));
    return at < 0 ? null : left.splice(at, 1)[0]!;
  });
  return { drawings: matched, gone: left };
}
