/**
 * Where a finger's long press asked for a context menu. The menu that opens there stands with its
 * first row above the finger, since the hand covers what lies below it.
 */

/** A row of a menu sized for a finger, and the gap to the fingertip. */
export const TOUCH_MENU_LIFT_PX = 56;
/** How close in time and place a menu must open to the long press to be the one it asked for. */
const WITHIN_MS = 1000;
const WITHIN_PX = 24;
/** The least distance a lifted menu keeps from the window's top. */
const TOP_MARGIN_PX = 8;

let asked: { x: number; y: number; at: number } | null = null;

/** A long press at a point of the window is about to ask for its menu. */
export function noteTouchMenu(x: number, y: number, now: number = performance.now()): void {
  asked = { x, y, at: now };
}

/** The point a menu asked for at `position` opens at: lifted above the finger where a long press asked for it there and the window has the room. */
export function touchMenuPosition(position: { x: number; y: number }, now: number = performance.now()): { x: number; y: number } {
  const press = asked;
  if (!press) return position;
  if (now - press.at > WITHIN_MS) {
    asked = null;
    return position;
  }
  if (Math.hypot(position.x - press.x, position.y - press.y) > WITHIN_PX) return position;
  asked = null;
  const lifted = position.y - TOUCH_MENU_LIFT_PX;
  return lifted >= TOP_MARGIN_PX ? { x: position.x, y: lifted } : position;
}
