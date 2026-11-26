import type { RollingDice } from './diceSetTypes';

/**
 * A roll a table keeps to roll again with one click: `Longsword` · `1d8+3[slashing]`. With a `look` it is dice
 * designed as in the Dice Lab (each die's name and colour, critical, exploding and advantage rules), and `formula`
 * is only the bonus added to them (`+3`, or empty).
 */
export interface DicePreset {
  id: string;
  name: string;
  formula: string;
  look?: RollingDice | undefined;
}

/** One place in the dice tray's row: a die (any number of faces), or a saved roll by its id. */
export type DiceRowSlot = { kind: 'die'; sides: number } | { kind: 'preset'; id: string };
