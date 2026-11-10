/**
 * A set's dice as a small stack before its name in a picker: a few of them,
 * overlapping like dice held in a hand, inside a column of fixed width so
 * the names of every row start on one line.
 */

import type { DiceSetDie } from '../../../../types/diceSetTypes';

/** One die of the stack. */
export interface StackDie {
  sides: number;
  colour?: string | undefined;
}

/** The dice shown, and how many of the set's dice are left out. */
export interface DiceStack {
  dice: StackDie[];
  more: number;
}

/**
 * At most `most` of the set's dice, so that every kind shows before any kind
 * shows twice: Sun and Moon both, a horde's d6, d8 and d20 before its second
 * d6. The dice keep the set's order.
 */
export function stackOfDice(groups: readonly DiceSetDie[], most: number): DiceStack {
  const taken = groups.map(() => 0);
  let shown = 0;
  for (let round = 0; shown < most; round++) {
    let tookAny = false;
    for (const [i, group] of groups.entries()) {
      if (shown >= most || group.count <= round) continue;
      taken[i]! += 1;
      shown += 1;
      tookAny = true;
    }
    if (!tookAny) break;
  }
  const dice = groups.flatMap((group, i) => Array.from({ length: taken[i]! }, (): StackDie => ({
    sides: group.sides,
    ...(group.colour !== undefined && { colour: group.colour }),
  })));
  const total = groups.reduce((sum, group) => sum + group.count, 0);
  return { dice, more: total - shown };
}

/** Where each die of a stack lies, and the height all are shown at. */
export interface StackPlaces {
  height: number;
  /** The left edge of each die, from the column's left edge. */
  lefts: number[];
}

/** How much of the die before it a die covers at most, and at least, as a share of that die's width. */
const MOST_COVER = 0.62;
const LEAST_COVER = 0.32;

/**
 * Lays dice of the given widths (at `height`) out in a column `width` wide:
 * each covers part of the one before it, more the more there are, and they
 * shrink where even the most cover would not fit them. The stack is centred
 * in the column.
 */
export function placeStack(aspects: readonly number[], width: number, height: number): StackPlaces {
  if (aspects.length === 0) return { height, lefts: [] };
  const widthsAt = (h: number): number[] => aspects.map((aspect) => aspect * h);
  const spanAt = (h: number, cover: number): number => {
    const widths = widthsAt(h);
    return widths.reduce((sum, w, i) => sum + (i === widths.length - 1 ? w : w * (1 - cover)), 0);
  };
  const least = spanAt(height, MOST_COVER);
  const shown = least > width ? height * (width / least) : height;
  const widths = widthsAt(shown);
  // The least cover that fits, never below LEAST_COVER: they always overlap a little.
  const head = widths.slice(0, -1).reduce((sum, w) => sum + w, 0);
  const room = width - widths.at(-1)!;
  const cover = head === 0 ? 0 : Math.min(MOST_COVER, Math.max(LEAST_COVER, 1 - room / head));
  const span = spanAt(shown, cover);
  const lefts: number[] = [];
  let x = (width - span) / 2;
  for (const w of widths) {
    lefts.push(x);
    x += w * (1 - cover);
  }
  return { height: shown, lefts };
}
