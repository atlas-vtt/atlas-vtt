import { afterEach, describe, expect, it, vi } from 'vitest';
import { PLAYER_MIRROR_FPS, type PlayerFrameSource } from '../../src/app/services/PlayerFrameMirror';
import { MIRRORED, SETTINGS, mirroring, setupMirror } from '../mocks/mirrorHarness';

afterEach(() => { vi.restoreAllMocks(); });

const INTERVAL = 1000 / PLAYER_MIRROR_FPS;

/**
 * While a scene loads, its store is rewritten in steps and the canvas shows it half built:
 * unlit, without fog, with every token. Players keep the last frame until the load is done.
 */
describe('PlayerFrameMirror while the presented scene loads', () => {
  it('captures no frame, however often the DM canvas renders or the player window asks', () => {
    const { events, frame, dm, onFrame } = mirroring();
    dm.setLoading(true);

    for (let time = 100; time < 200; time += 8) {
      dm.change();
      dm.tick(time);
      frame(time + 2);
    }

    expect(events.length).toBeGreaterThan(5);
    expect(new Set(events)).toEqual(new Set(['render:dm']));
    expect(onFrame).not.toHaveBeenCalled();
  });

  it('does not ask the loading canvas for renders, nor capture it when none comes for long', () => {
    const { mirror, events, frame, dm } = mirroring();
    const requestRender = vi.spyOn(dm.source.beforeRender!, 'requestRender');
    dm.setLoading(true);
    mirror.markStale();

    // A fast load stops the DM's ticker; a slow one takes longer than the mirror waits for a render.
    for (let time = 100; time < 1200; time += 8) frame(time);

    expect(events).toEqual([]);
    expect(requestRender).not.toHaveBeenCalled();
  });

  it('delivers the first frame within one cap interval of the end of the load, though nothing else changed', () => {
    const { events, frame, dm } = mirroring();
    dm.setLoading(true);
    for (let time = 100; time < 600; time += 8) frame(time);

    dm.setLoading(false);
    const end = 600;
    let delivered: number | null = null;
    for (let time = end; delivered === null && time < end + 100; time += 8) {
      frame(time);
      dm.tick(time + 1);
      if (events.includes('capture:player')) delivered = time + 1;
    }

    expect(events).toEqual(MIRRORED);
    expect(delivered! - end).toBeLessThanOrEqual(INTERVAL);
  });

  it('mirrors the render that ends the load, when the DM canvas draws it before the player window asks', () => {
    const { events, dm } = mirroring();
    dm.setLoading(true);
    dm.change();
    dm.tick(100);
    expect(events).toEqual(['render:dm']);

    events.length = 0;
    dm.setLoading(false);
    dm.change();
    dm.tick(108);
    expect(events).toEqual(MIRRORED);
  });

  it('still draws a held frame, and mirrors through the frozen camera once the load is done', () => {
    const { events, frame, dm, state } = mirroring();
    const capture = vi.spyOn(dm.source.beforeRender!, 'withPlayerSafeFrame');
    dm.setLoading(true);
    state.held = document.createElement('canvas');
    frame(100);
    frame(108);
    expect(events).toEqual(['draw:held']);

    // The hold is released while the scene still loads: the held frame stays on screen.
    events.length = 0;
    state.held = null;
    state.frozen = { centerX: 10, centerY: 20, scale: 2 };
    frame(200);
    dm.change();
    dm.tick(201);
    expect(events).toEqual(['render:dm']);

    events.length = 0;
    dm.setLoading(false);
    frame(300);
    dm.tick(301);
    expect(events).toEqual(MIRRORED);
    expect(capture).toHaveBeenLastCalledWith(expect.any(Function), SETTINGS, expect.objectContaining({ centerX: 10, centerY: 20, scale: 4 }));
  });
});

describe('PlayerFrameMirror on a canvas without a render schedule while its scene loads', () => {
  function unscheduled(dm: ReturnType<typeof setupMirror>['dm'], withStore: boolean): PlayerFrameSource {
    const { getCamera, getScreen, store, withPlayerSafeFrame } = dm.source;
    return { getCamera, getScreen, withPlayerSafeFrame, ...(withStore && store ? { store } : {}) };
  }

  it('captures nothing during the load and the next display frame after it', () => {
    const { events, frame, dm, state } = setupMirror();
    state.source = unscheduled(dm, true);
    frame(0);
    events.length = 0;

    dm.setLoading(true);
    frame(8);
    frame(400);
    expect(events).toEqual([]);

    dm.setLoading(false);
    frame(408);
    expect(events).toEqual(MIRRORED);
  });

  it('captures a source without a store as before, whatever loads elsewhere', () => {
    const { events, frame, dm, state } = setupMirror();
    state.source = unscheduled(dm, false);
    dm.setLoading(true);

    frame(0);
    frame(8);

    expect(events).toEqual([...MIRRORED, ...MIRRORED]);
  });
});
