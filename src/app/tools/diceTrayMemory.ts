import type { AdvantageSide } from '../types/diceSetTypes';

export type TrayAdvantageChoice = AdvantageSide | 'normal';

/** A roll made from the dice tray: what it rolls and with which side of advantage. */
export interface TrayRoll {
  /** As the tray wrote it (`1d20 + 5`, with a true minus sign). */
  formula: string;
  advantage: AdvantageSide | null;
}

/**
 * What the dice tray holds while it is closed: the formula it was left with (closing keeps the dice, only a roll
 * empties them) and the side of advantage. Kept per view for the session, never saved. Earlier rolls are the dice
 * log's (the view store's `diceLog`), never a list of the tray's own.
 */
export interface DiceTrayMemory {
  formula: string;
  side: TrayAdvantageChoice;
}

export function emptyTrayMemory(): DiceTrayMemory {
  return { formula: '', side: 'normal' };
}
