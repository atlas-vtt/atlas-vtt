import type { RollingDice } from '../types/diceSetTypes';
import type { RolledDie } from './diceFormula';

/**
 * The set's names and colours on an explicit pool that starts with the same
 * dice in the same order. The whole pool must match. Extra dice stay plain;
 * explosions and rerolls keep the appearance of the die they came from.
 * Counts, faces, values, signs and the written formula never change.
 */
export function dressSetDice(rolls: readonly RolledDie[], set: RollingDice): RolledDie[] {
  const dice = set.dice.flatMap((group) => Array.from({ length: group.count }, () => group));
  let at = -1;
  let reroll = false;
  const indices = rolls.map((die) => {
    if (!die.exploded && !reroll) at += 1;
    const index = at;
    reroll = die.rerolled === true;
    return index;
  });
  const bases = rolls.filter((die, i) => i === 0 || indices[i] !== indices[i - 1]);
  if (dice.length === 0 || dice.some((group, i) => bases[i]?.max !== group.sides || bases[i]?.negative || bases[i]?.min !== undefined)) return [...rolls];
  return rolls.map((die, i) => {
    const look = dice[indices[i] ?? -1];
    return look === undefined ? die : { ...die, ...(look.name && { name: look.name }), ...(look.colour && { colour: look.colour }) };
  });
}
