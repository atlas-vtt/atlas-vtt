/**
 * Real input for browser tests: mouse events sent through the browser's own
 * input protocol (`Input.dispatchMouseEvent`), so pointer, compatibility mouse
 * and focus events, default actions and pointer capture behave as with a
 * mouse, never synthetic `PointerEvent`s (spec §16).
 */

import { cdp } from 'vitest/browser';

/** Keys held with a mouse event, as the browser's input protocol counts them. */
export const CTRL_KEY = 2;
export const SHIFT_KEY = 8;

type MouseType = 'mouseMoved' | 'mousePressed' | 'mouseReleased';

function inRunnerPage(x: number, y: number): { x: number; y: number } {
  const host = window.frameElement?.getBoundingClientRect() ?? { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
  return {
    x: host.left + x * host.width / window.innerWidth,
    y: host.top + y * host.height / window.innerHeight,
  };
}

/**
 * The real mouse: points are in this frame's client coordinates, which the
 * test runner shows scaled inside its own page, where the input lands.
 */
export const mouse = {
  async send(type: MouseType, x: number, y: number, pressed: boolean, modifiers = 0, button: 'left' | 'right' = 'left'): Promise<void> {
    await cdp().send('Input.dispatchMouseEvent', {
      type,
      ...inRunnerPage(x, y),
      button: type === 'mouseMoved' && !pressed ? 'none' : button,
      buttons: pressed ? (button === 'left' ? 1 : 2) : 0,
      clickCount: type === 'mouseMoved' ? 0 : 1,
      modifiers,
    });
  },
  /** The wheel, one notch being about 100 px of `deltaY`. */
  async wheel(x: number, y: number, deltaY: number, modifiers = 0): Promise<void> {
    await cdp().send('Input.dispatchMouseEvent', {
      type: 'mouseWheel',
      ...inRunnerPage(x, y),
      deltaX: 0,
      deltaY,
      modifiers,
    });
  },
  down: (x: number, y: number): Promise<void> => mouse.send('mousePressed', x, y, true),
  move: (x: number, y: number): Promise<void> => mouse.send('mouseMoved', x, y, true),
  up: (x: number, y: number): Promise<void> => mouse.send('mouseReleased', x, y, false),
  /** Moves without a button held: hover. */
  hover: (x: number, y: number): Promise<void> => mouse.send('mouseMoved', x, y, false),
  async click(x: number, y: number): Promise<void> {
    await mouse.send('mousePressed', x, y, true);
    await mouse.send('mouseReleased', x, y, false);
  },
  async rightClick(x: number, y: number): Promise<void> {
    await mouse.send('mousePressed', x, y, true, 0, 'right');
    await mouse.send('mouseReleased', x, y, false, 0, 'right');
  },
};

/**
 * Presses at `from` and moves to `to` in `steps` moves, a frame apart (16 to
 * 30 as a hand gives them); `each` runs after every move. The button stays down.
 */
export async function pressAndMove(from: { x: number; y: number }, to: { x: number; y: number }, steps = 20, each?: () => void): Promise<void> {
  await mouse.hover(from.x, from.y);
  await mouse.down(from.x, from.y);
  for (let step = 1; step <= steps; step++) {
    await mouse.move(from.x + ((to.x - from.x) * step) / steps, from.y + ((to.y - from.y) * step) / steps);
    await new Promise((resolve) => requestAnimationFrame(resolve));
    each?.();
  }
}

export function centreOf(element: Element): { x: number; y: number } {
  const rect = element.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}
