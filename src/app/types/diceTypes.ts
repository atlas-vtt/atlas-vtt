import type { DiceCrit } from '../tools/diceCrit';
import type { NamedModifier, RolledDie } from '../tools/diceFormula';
import type { AdvantageSide, RolledWithSet } from './diceSetTypes';

export interface DiceRollResult {
  id: string;
  timestamp: number;
  formula: string;
  rolls: RolledDie[];
  /** The constants added to the dice; 0 where the formula is no plain sum (`linear`). */
  modifiers: number;
  /**
   * The labelled constants among `modifiers` (`+2[Proficiency]`), each shown as a term of its own. Part of
   * `modifiers`, so a reader that knows only the sum (an older Atlas, the players' page) still adds up; missing
   * on rolls without one and on rolls logged before named modifiers existed.
   */
  namedModifiers?: NamedModifier[];
  total: number;
  /** The formula multiplies, divides or counts dice, so its constants are no modifier; unset for a plain sum. */
  linear?: false;
  /** Decided by the collection's critical rule when rolled; missing on rolls logged before rules existed. */
  crit?: DiceCrit;
  /** The dice set a bare bonus rolled with, where it was not the collection's own (a statblock template's). */
  diceSet?: RolledWithSet;
  /** The side of advantage the roll was made with, where the set's rule changed it; the dice it dropped are marked `dropped`. */
  advantage?: AdvantageSide;
  player?: string;
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
