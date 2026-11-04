/**
 * Whether a Dice value rolls: the whole text one roll by the text-roll rule (`tools/textRolls.ts`),
 * which the dice parser accepts within its limits (`2d8 + 2`, `+4+1`, `(2d6 + 3)`, `3d6kh2`). Every
 * check of a Dice value reads it: the note panel's fit, a player's edit online, a value's
 * `rollFrom`. Pure.
 */

import { writtenRoll } from '../../tools/textRolls';
import { fillReferences } from './fillReferences';
import type { FieldLookup } from './references';
import type { LookupTrace, TracedLookup } from './statblockLookup';

/** Whether a Dice value written without references rolls as a whole. */
export function isDiceValue(text: string): boolean {
  return writtenRoll(text) !== null;
}

/**
 * Whether a Dice value rolls once its `@` references are filled in by `lookup` (`1d8 + @str`): every
 * one must name a number, and the filled text must roll. The value itself keeps its references.
 */
export function rollsWithReferences(text: string, lookup: FieldLookup): boolean {
  const filled = fillReferences(text, lookup);
  return filled.unresolved.length === 0 && isDiceValue(filled.text);
}

const sameTrace = (a: LookupTrace, b: LookupTrace): boolean => a.length === b.length && a.every((read, at) => read === b[at]);

/**
 * Whether every `@` reference of `text` reads the same field through both lookups: `seen`, over the
 * values a reader may see, and `all`, over the whole note. Each reference must name the same path in
 * both (or nothing in both) and read it from the same keys (`LookupTrace`), not merely come to the
 * same number, so a name that one lookup reads from a hidden field and the other from a field shown
 * under that name never agrees. An answer either lookup cut short (`TracedAnswer.exhausted`) never
 * agrees: two traces cut alike may still read otherwise past the cut. Text without references agrees.
 */
export function referencesAgree(text: string, seen: TracedLookup, all: TracedLookup): boolean {
  let agree = true;
  fillReferences(text, (path) => {
    const shown = seen(path);
    const whole = all(path);
    if (shown.exhausted || whole.exhausted || !Object.is(shown.value, whole.value) || !sameTrace(shown.trace, whole.trace)) agree = false;
    return shown.value;
  });
  return agree;
}
