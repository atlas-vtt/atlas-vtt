/**
 * Where statblock text holds dice notation and bare bonuses, and the formula
 * each rolls, as the card's roll links (`statblockDiceLinks.ts`) and a
 * player's sheet read them. The rule is `tools/textRolls.ts`.
 */

import { rollPieces } from '../tools/textRolls';

export { toRollFormula } from '../tools/textRolls';

/** Splits text into plain and dice segments: what renderers build their own nodes from, and what the card links. */
export function splitDiceSegments(text: string): Array<{ text: string; dice: boolean }> {
  return rollPieces(text).map((piece) => ({ text: piece.text, dice: piece.formula !== null }));
}
