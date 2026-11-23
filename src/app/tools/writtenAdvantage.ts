/**
 * Advantage written into a formula: `1d20+5 adv`, `+3 dis`, or the word alone
 * for the set's dice. The word stands last, after a space, as Avrae writes it,
 * and asks for the same side Shift-click and Alt-click do, so the dice set's
 * rule for that side decides what it does (2d20 keep the best, Draw Steel's
 * edge, Call of Cthulhu's bonus die).
 */

import type { AdvantageSide } from '../types/diceSetTypes';

const SIDE_WORDS: Readonly<Record<string, AdvantageSide>> = { adv: 'advantage', dis: 'disadvantage' };

const WRITTEN_SIDE = /(?:^|[ \t]+)(adv|dis)[ \t]*$/i;

export interface WrittenSide {
  /** The formula without the word. */
  formula: string;
  /** The side the word asks for; null where none is written. */
  side: AdvantageSide | null;
  /** The word as it is written (`adv`, `Dis`); empty where none is. */
  word: string;
}

/** `formula` split into the formula it rolls and the side its last word asks for. */
export function writtenSide(formula: string): WrittenSide {
  const word = WRITTEN_SIDE.exec(formula);
  if (!word) return { formula, side: null, word: '' };
  const written = word[1]!;
  return { formula: formula.slice(0, word.index), side: SIDE_WORDS[written.toLowerCase()] ?? null, word: written };
}

/** `text` changed by `change` before a side written last (`2d20 + 3 adv`), which stays last. */
export function changedBeforeSide(text: string, change: (formula: string) => string): string {
  const written = writtenSide(text);
  if (written.word === '') return change(text);
  const changed = change(written.formula).trimEnd();
  return changed === '' ? written.word : `${changed} ${written.word}`;
}

/** The side a roll is made with when the formula writes one and a click or the tray asks for one: opposite sides cancel. */
export function combinedSide(written: AdvantageSide | null, asked: AdvantageSide | null | undefined): AdvantageSide | null {
  if (!written) return asked ?? null;
  if (!asked) return written;
  return written === asked ? written : null;
}
