/**
 * How many uses of a counter come back when it is restored: a dice formula Atlas's dice parser reads and that
 * rolls at least one die ("1d6+1", "2d4"), or none (all of them). Pure.
 */

import { parseFormula } from '../../tools/parseFormula';

/** Whether a row's `regain` is a formula Atlas rolls: it parses, within the dice limits, and holds a die. */
export function isRegainFormula(text: string): boolean {
  const parsed = parseFormula(text);
  return parsed.ok && parsed.terms.some((term) => term.kind === 'dice' && term.count > 0);
}

/** A row's uses once restored: all back where it regains all, else `rolled` fewer used (a total below 0 gives none back). */
export function usedAfterRegain(used: number, rolled: number | null): number {
  return rolled === null ? 0 : Math.max(0, used - Math.max(0, Math.trunc(rolled)));
}
