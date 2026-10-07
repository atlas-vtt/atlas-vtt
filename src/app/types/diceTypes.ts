import type { DiceCrit } from '../tools/diceCrit';
import type { RolledDie } from '../tools/diceFormula';

export interface DiceRollResult {
  id: string;
  timestamp: number;
  formula: string;
  rolls: RolledDie[];
  modifiers: number;
  total: number;
  /** Decided by the collection's critical rule when rolled; missing on rolls logged before rules existed. */
  crit?: DiceCrit;
  /** Dice the roll had beyond those in `rolls`: a log may list only the first of a roll's dice (for example a long roll made by someone other than the GM). */
  unlistedDice?: number;
  /** Atlas's own label for the GM's roller ("Player" in English), stamped on every roll; not who rolled it. */
  player?: string;
  /** Who rolled it when it was someone other than the GM: their name. Atlas shows it in the log and toasts. */
  rolledBy?: string;
  source?: {
    type: 'toolbar' | 'statblock';
    /** Let the roll follow its token's or statblock's current artwork. */
    tokenId?: string;
    statblockPath?: string;
    tokenName?: string;
    tokenImagePath?: string;
    abilityName?: string;
  };
}
