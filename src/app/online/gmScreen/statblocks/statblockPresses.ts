import type { StatblockPress, StatblockPressAnswer, STATBLOCK_PRESS_REFUSALS } from '../../protocol/index.ts';
import { DevicePresses } from './devicePresses.ts';
import type { FrontScene } from './frontScene.ts';
import { isPressableControl } from './pressableControl.ts';
import type { SentDrawing } from './statblockRolls.ts';

export type StatblockPressRefusal = (typeof STATBLOCK_PRESS_REFUSALS)[number];
export interface StatblockPressOutcome {
  readonly refused: StatblockPressRefusal | null;
}

/**
 * How fast a device may press a token's controls: a GM taps a step once for each point of damage, faster than they roll,
 * so ten at once and five a second after.
 */
export const CONTROL_BURST = 10;
export const CONTROL_REFILL_MS = 200;

/** Each device's presses on statblock controls (`DevicePresses`), at the pace of a GM tapping a resource's steps. */
export class ControlPresses extends DevicePresses<StatblockPressOutcome, StatblockPressAnswer> {
  constructor(now?: () => number) {
    super((id, outcome) => ({ t: 'statblock-press-answer', id, ...outcome }), { burst: CONTROL_BURST, refillMs: CONTROL_REFILL_MS }, now);
  }
}

/**
 * Presses what a device pressed beside the statblock it shows: the control of that number in the drawing it was sent
 * (`DrawnTree.presses`), clicked where Atlas drew it, so the DM screen's own control runs (a resource changed as the GM's
 * click changes it, the token located on the map in front). Refused, and nothing is pressed, without a map loaded in
 * front (`scene` null), where the drawing is not the one sent or was drawn for another map than the one in front, holds
 * no control of that number, or that control left the drawing or may not be pressed now (`isPressableControl`), and where
 * `pace` says the device presses too fast. A device names a number Atlas gave, never a token or a value.
 */
export function pressControl(sent: SentDrawing | undefined, press: StatblockPress, scene: Pick<FrontScene, 'viewId'> | null, pace: () => boolean): StatblockPressOutcome {
  if (scene === null) return { refused: 'no-map' };
  const control = sent?.rollsOn() === scene.viewId && sent.drawing === press.drawing ? sent.presses[press.press] : undefined;
  if (control === undefined || !control.isConnected || !isPressableControl(control)) return { refused: 'changed' };
  if (!pace()) return { refused: 'too-fast' };
  const Click = control.ownerDocument.defaultView?.MouseEvent ?? MouseEvent;
  control.dispatchEvent(new Click('click', { bubbles: true, cancelable: true }));
  return { refused: null };
}
