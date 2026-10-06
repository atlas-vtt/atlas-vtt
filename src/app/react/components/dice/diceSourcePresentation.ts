import type { DiceRollResult } from '../../../types/diceTypes';

/** A roller's portrait: the token's artwork, framed as it is on the map. */
export interface DiceAvatar {
  src: string;
  showRing: boolean;
  ringColor: string | undefined;
}

/** Who a shown roll names, fixed when it arrived: the name and portrait players may see. */
export interface RollSourcePresentation {
  readonly name: string | null;
  readonly avatar: DiceAvatar | null;
}

/** A roll ready to show, with who it names. */
export interface PreparedDiceRoll {
  result: DiceRollResult;
  /**
   * Unset: the roller is looked up as the GM's window does. Null: the roll names nobody,
   * and nothing is looked up for it. A value: exactly this name and portrait.
   */
  sourcePresentation?: RollSourcePresentation | null;
}
