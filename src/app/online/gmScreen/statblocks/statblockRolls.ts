import type { DiceRollResult } from '../../../types/diceTypes';
import { parseStatblockRollResult, type STATBLOCK_ROLL_REFUSALS, type StatblockRollPress, type StatblockRollResult } from '../../protocol/index.ts';
import type { FrontScene, FrontScenes } from './frontScene.ts';
import { isPressableRoll } from './pressableRoll.ts';

export type StatblockRollRefusal = (typeof STATBLOCK_ROLL_REFUSALS)[number];

/** What a press came to: refused for a reason, or rolled, with what the roll came to where it can be told. */
export type StatblockRollOutcome = { readonly refused: StatblockRollRefusal } | { readonly refused: null; readonly result?: StatblockRollResult };

/**
 * The map in front, where it is the view `viewId` and has its map loaded now: a list read a moment ago may be behind.
 * Kept out of `frontScene.ts`, whose map view code a screen read without a workspace must not load.
 */
export function loadedFront(scenes: FrontScenes, viewId: string | undefined): FrontScene | null {
  const scene = scenes.current();
  const state = scene?.state();
  return scene && state && scene.viewId === viewId && state.mapPath !== null && state.mapLoaded && !state.isMapLoading ? scene : null;
}

/** A drawing as its devices were sent it: its number, and the roll links it numbered with the formula each showed then. */
export interface SentDrawing {
  readonly drawing: number;
  readonly rolls: readonly { readonly link: Element; readonly formula: string }[];
}

/** What a drawing's roll links were as they were sent (`drawnTree`'s `rolls`). */
export function sentRolls(links: readonly Element[]): SentDrawing['rolls'] {
  return links.map((link) => ({ link, formula: link.getAttribute('data-formula') ?? '' }));
}

/** The roll link a press names in the drawing it was sent; null where that drawing is gone, holds no roll of that number, or the link left it, shows another formula or may not be pressed. */
function pressedLink(sent: SentDrawing | undefined, press: StatblockRollPress): Element | null {
  const roll = sent?.drawing === press.drawing ? sent.rolls[press.roll] : undefined;
  if (roll === undefined || !roll.link.isConnected || roll.link.getAttribute('data-formula') !== roll.formula || !isPressableRoll(roll.link)) return null;
  return roll.link;
}

/** Clicks a roll link where Atlas drew it, as the GM's click would be, and gives the roll that click made on the map in front, as the dice tool made it; null where nothing rolled. */
function clickRoll(link: Element, scene: Pick<FrontScene, 'watchRolls'>): DiceRollResult | null {
  const rolls: DiceRollResult[] = [];
  const stop = scene.watchRolls((result) => rolls.push(result));
  try {
    const Click = link.ownerDocument.defaultView?.MouseEvent ?? MouseEvent;
    link.dispatchEvent(new Click('click', { bubbles: true, cancelable: true }));
  } finally {
    stop();
  }
  return rolls[0] ?? null;
}

/** A roll as a device is told it, read from the roll itself, within what the protocol lets one say; nothing where its total is past that. */
function resultOf(roll: DiceRollResult): { result?: StatblockRollResult } {
  const result = parseStatblockRollResult({ formula: roll.formula, total: roll.total, crit: roll.crit });
  return result ? { result } : {};
}

/**
 * Rolls what a device pressed in the statblock it shows: the roll link of that number in the drawing it was sent, which
 * is clicked where Atlas drew it, so the DM screen's own roll runs (`attachDiceRolling`: the formula as drawn, the roll's
 * name, the creature that rolls, the map's dice and rules, who is shown it). Refused, and nothing rolls, without a map
 * loaded in front (`scene` null), where the drawing is not the one sent, holds no roll of that number, or that link left
 * the drawing, shows another formula since or may not be pressed (`isPressableRoll`), and where `pace` says the device
 * presses too fast. A click that made no roll on that map is told as such. A device names a number Atlas gave, never a formula.
 */
export function pressRoll(sent: SentDrawing | undefined, press: StatblockRollPress, scene: Pick<FrontScene, 'watchRolls'> | null, pace: () => boolean): StatblockRollOutcome {
  if (scene === null) return { refused: 'no-map' };
  const link = pressedLink(sent, press);
  if (link === null) return { refused: 'changed' };
  if (!pace()) return { refused: 'too-fast' };
  const roll = clickRoll(link, scene);
  return roll === null ? { refused: 'not-rolled' } : { refused: null, ...resultOf(roll) };
}
