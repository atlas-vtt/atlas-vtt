/** The dice of initiative: a combatant's roll, a side's roll, and the shuffle of a deck of cards. */

import { parseDefaultRoll } from '../gameSystems/diceRules';

/** The total of a dice group such as `1d20` or `2d6`; a d20 when `roll` is none. */
export function rollInitiativeDice(roll: string, random: () => number): number {
  const { count, sides } = parseDefaultRoll(roll) ?? { count: 1, sides: 20 };
  let total = 0;
  for (let die = 0; die < count; die++) total += Math.floor(random() * sides) + 1;
  return total;
}

/** The cards 1 to `size` in a shuffled order (Fisher–Yates). */
export function shuffledDeck(size: number, random: () => number): number[] {
  const deck = Array.from({ length: Math.max(0, size) }, (_, index) => index + 1);
  for (let index = deck.length - 1; index > 0; index--) {
    const other = Math.floor(random() * (index + 1));
    [deck[index], deck[other]] = [deck[other]!, deck[index]!];
  }
  return deck;
}
