/** A roll a table keeps to roll again with one click: `Longsword` · `1d8+3[slashing]`. */
export interface DicePreset {
  id: string;
  name: string;
  formula: string;
}

/** One place in the dice tray's row: a die (any number of faces), or a saved roll by its id. */
export type DiceRowSlot = { kind: 'die'; sides: number } | { kind: 'preset'; id: string };
