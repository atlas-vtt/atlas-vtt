import { afterEach, describe, expect, it } from 'vitest';
import { followVisualViewport, visiblePartOf, visibleViewport } from '../../../src/app/host/visibleViewport';

/** A window 1180 × 820 whose keyboard, when up, leaves `visual` of it in sight. */
function fakeWindow(visual?: { offsetLeft: number; offsetTop: number; width: number; height: number }): Window {
  return { innerWidth: 1180, innerHeight: 820, visualViewport: visual ?? null } as unknown as Window;
}

const KEYBOARD_UP = { offsetLeft: 0, offsetTop: 0, width: 1180, height: 380 };

describe('visibleViewport', () => {
  let restore: (() => void) | undefined;
  afterEach(() => {
    restore?.();
    restore = undefined;
  });

  it('is the window itself on desktop, whatever its visual viewport says', () => {
    // Page zoom gives a visual viewport a fraction of a pixel off the window's size
    const win = fakeWindow({ offsetLeft: 0, offsetTop: 0, width: 1179.6, height: 819.7 });
    expect(visibleViewport(win)).toEqual({ left: 0, top: 0, right: 1180, bottom: 820 });
  });

  it('is what the keyboard leaves in sight once the application follows the visual viewport', () => {
    restore = followVisualViewport(true);
    expect(visibleViewport(fakeWindow(KEYBOARD_UP))).toEqual({ left: 0, top: 0, right: 1180, bottom: 380 });
  });

  it('follows a visual viewport that was panned inside the page', () => {
    restore = followVisualViewport(true);
    const win = fakeWindow({ offsetLeft: 20, offsetTop: 140, width: 1000, height: 380 });
    expect(visibleViewport(win)).toEqual({ left: 20, top: 140, right: 1020, bottom: 520 });
  });

  it('is the window where it has no visual viewport', () => {
    restore = followVisualViewport(true);
    expect(visibleViewport(fakeWindow())).toEqual({ left: 0, top: 0, right: 1180, bottom: 820 });
  });

  it('goes back to the window when following ends', () => {
    followVisualViewport(true)();
    expect(visibleViewport(fakeWindow(KEYBOARD_UP)).bottom).toBe(820);
  });
});

describe('visiblePartOf', () => {
  const leaf = { left: 300, top: 40, right: 1180, bottom: 820 };

  it('is the box itself on desktop', () => {
    expect(visiblePartOf(leaf, fakeWindow(KEYBOARD_UP))).toBe(leaf);
  });

  it('ends at the keyboard on mobile', () => {
    const restore = followVisualViewport(true);
    expect(visiblePartOf(leaf, fakeWindow(KEYBOARD_UP))).toEqual({ left: 300, top: 40, right: 1180, bottom: 380 });
    restore();
  });
});
