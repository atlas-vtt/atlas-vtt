// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FALLBACK_AFTER_MS, FALLBACK_FPS, PlayerMirrorFallback } from '../../src/app/services/playerMirrorFallback';

const INTERVAL_MS = 1000 / FALLBACK_FPS;

/** A player window whose page reports `visibility`. */
function playerWindow(visibility: DocumentVisibilityState = 'visible'): Window {
  return { closed: false, document: { visibilityState: visibility } } as unknown as Window;
}

describe('PlayerMirrorFallback', () => {
  beforeEach(() => { vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'performance'] }); });
  afterEach(() => { vi.useRealTimers(); });

  it('steps nothing while the player window shows display frames', () => {
    const step = vi.fn();
    const fallback = new PlayerMirrorFallback(() => playerWindow(), step);
    fallback.start();
    for (let elapsed = 0; elapsed < 2000; elapsed += 16) {
      fallback.displayFrame();
      vi.advanceTimersByTime(16);
    }
    expect(step).not.toHaveBeenCalled();
    fallback.stop();
  });

  it('steps the mirror at its own rate once the window has had no display frame for a while, and gives way when frames return', () => {
    const step = vi.fn();
    const fallback = new PlayerMirrorFallback(() => playerWindow(), step);
    fallback.start();
    vi.advanceTimersByTime(FALLBACK_AFTER_MS - INTERVAL_MS);
    expect(step).not.toHaveBeenCalled();

    vi.advanceTimersByTime(INTERVAL_MS + 1000);
    // About 30 steps in that second, never one per display frame of a fast screen
    expect(step.mock.calls.length).toBeGreaterThanOrEqual(FALLBACK_FPS);
    expect(step.mock.calls.length).toBeLessThanOrEqual(FALLBACK_FPS + 2);

    step.mockClear();
    for (let elapsed = 0; elapsed < 1000; elapsed += 16) {
      fallback.displayFrame();
      vi.advanceTimersByTime(16);
    }
    expect(step).not.toHaveBeenCalled();
    fallback.stop();
  });

  it('steps nothing for a window the page reports hidden, nor for a closed one or a loop that ended', () => {
    const step = vi.fn();
    let win: Window | null = playerWindow('hidden');
    const fallback = new PlayerMirrorFallback(() => win, step);
    fallback.start();
    vi.advanceTimersByTime(2000);
    expect(step).not.toHaveBeenCalled();

    win = { ...playerWindow(), closed: true } as Window;
    vi.advanceTimersByTime(500);
    win = null;
    vi.advanceTimersByTime(500);
    expect(step).not.toHaveBeenCalled();

    win = playerWindow();
    vi.advanceTimersByTime(INTERVAL_MS);
    expect(step).toHaveBeenCalled();
    fallback.stop();
  });

  it('stops its clock', () => {
    const step = vi.fn();
    const fallback = new PlayerMirrorFallback(() => playerWindow(), step);
    fallback.start();
    fallback.stop();
    vi.advanceTimersByTime(5000);
    expect(step).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
