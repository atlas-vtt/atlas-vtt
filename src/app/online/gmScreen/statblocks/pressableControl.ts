/**
 * The controls a statblock draws beside its tokens on the DM screen (`StatblockTokenResources`): a resource's steps, the
 * boxes of a resource counted in boxes, and a token's locate. Only these are sent as pressable; every other control of a
 * drawing (a layout's own button, an edit pencil) stays a picture of itself.
 */
const CONTROLS = [
  '.atlas-sb-token-list .atlas-sb-token-gauge-controls button',
  '.atlas-sb-token-list .atlas-sb-token-pips input[type="checkbox"]',
  '.atlas-sb-token-list button.atlas-sb-token-name',
].join(', ');

/** Whether a device may press a control of a drawing now: one of the token controls Atlas draws, not disabled (a step past a resource's end). */
export function isPressableControl(element: Element): boolean {
  return element.matches(CONTROLS) && !(element as HTMLButtonElement | HTMLInputElement).disabled && element.closest('a') === null;
}
