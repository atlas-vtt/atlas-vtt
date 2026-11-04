import type { DiceRollResult } from '../types/diceTypes';
import type { DiceDisplay } from './diceDisplay';
import { sceneFromRolls, type DiceScene } from './diceScene';

/**
 * The stage a roll is thrown on, or null when it shows as a result card: cards
 * are chosen, or the roll holds dice no real body can show.
 */
export function diceSceneToShow(result: DiceRollResult, display: DiceDisplay): DiceScene | null {
  return display === 'card' ? null : sceneFromRolls(result.rolls);
}
