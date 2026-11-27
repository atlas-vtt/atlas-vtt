import { isHitDice, isOwnDiceLink } from '../../../services/ownDiceLinks';

/**
 * Whether a device may press a roll link of a drawing: one Atlas's own dice code made, whose click on the DM screen
 * only rolls. Never the hit dice, whose click rolls the creature's hit points onto every one of its tokens, and never
 * a roll inside a link, whose click also follows that link.
 */
export function isPressableRoll(link: Element): boolean {
  return isOwnDiceLink(link) && !isHitDice(link) && link.closest('a') === null;
}
