import type { STATBLOCK_ROLL_REFUSALS, StatblockRollPress } from '../../protocol/index.ts';

export type StatblockRollRefusal = (typeof STATBLOCK_ROLL_REFUSALS)[number];

/** A drawing as its devices were sent it: its number, and the roll links it numbered with the formula each showed then. */
export interface SentDrawing {
  readonly drawing: number;
  readonly rolls: readonly { readonly link: Element; readonly formula: string }[];
}

/** What a drawing's roll links were as they were sent (`drawnTree`'s `rolls`). */
export function sentRolls(links: readonly Element[]): SentDrawing['rolls'] {
  return links.map((link) => ({ link, formula: link.getAttribute('data-formula') ?? '' }));
}

/**
 * Rolls what a device pressed in the statblock it shows: the roll link of that number in the drawing it was sent, which
 * is clicked where Atlas drew it, so the DM screen's own roll runs (`attachDiceRolling`: the formula as drawn, the roll's
 * name, the creature that rolls, the map's dice and rules, who is shown it). A press is refused, and nothing rolls, without
 * a map in front, and where the drawing is not the one sent, holds no roll of that number, or that link left the drawing
 * or shows another formula since. A device names a number Atlas gave, never a formula.
 */
export function pressRoll(sent: SentDrawing | undefined, press: StatblockRollPress, mapInFront: boolean): StatblockRollRefusal | null {
  if (!mapInFront) return 'no-map';
  const roll = sent?.drawing === press.drawing ? sent.rolls[press.roll] : undefined;
  if (roll === undefined || !roll.link.isConnected || roll.link.getAttribute('data-formula') !== roll.formula) return 'changed';
  // A click made in the link's own window, as the GM's would be.
  const Click = roll.link.ownerDocument.defaultView?.MouseEvent ?? MouseEvent;
  roll.link.dispatchEvent(new Click('click', { bubbles: true, cancelable: true }));
  return null;
}
