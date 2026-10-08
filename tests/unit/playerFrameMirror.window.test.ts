import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PlayerCameraState } from '../../src/app/local-player-view';
import { PlayerFrameMirror, type PlayerFrameSource } from '../../src/app/services/PlayerFrameMirror';
import { PLAYER_FRAME_PIXEL_BUDGET } from '../../src/app/services/playerFrame';
import type { AtlasSettings } from '../../src/app/services/SettingsService';
import type { PlayerFrame, Screen } from '../../src/app/types/playerFrame';
import { MIRRORED, mirroring, wholeFrame } from '../mocks/mirrorHarness';

afterEach(() => { vi.restoreAllMocks(); });

const SETTINGS = { showTokenNameplates: true } as AtlasSettings['localPlayerView'];

interface Harness {
  target: HTMLCanvasElement;
  state: { frozen: PlayerCameraState | null; window: Screen | null; pane: Screen; dm: PlayerCameraState; lost: boolean; rendersNothing: boolean };
  onFrame: ReturnType<typeof vi.fn>;
  drawImage: ReturnType<typeof vi.fn>;
  /** A display frame of the player window; returns the frame it had rendered, if any. */
  frame(): PlayerFrame | null;
}

/** The world rectangle a frame shows. */
function shown(frame: PlayerFrame): { left: number; top: number; width: number; height: number } {
  const width = frame.width / frame.resolution / frame.scale;
  const height = frame.height / frame.resolution / frame.scale;
  return { left: frame.centerX - width / 2, top: frame.centerY - height / 2, width, height };
}

/** A mirror on a view that is captured on every display frame, in a pane of 1200 × 800 showing the world at half size. */
function setup(): Harness {
  const state: Harness['state'] = {
    frozen: null,
    window: { width: 1920, height: 1080, resolution: 1 },
    pane: { width: 1200, height: 800, resolution: 1 },
    dm: { centerX: 2000, centerY: 1000, scale: 0.5 },
    lost: false,
    rendersNothing: false,
  };
  let rendered: PlayerFrame | null = null;
  const canvas = document.createElement('canvas');
  const source: PlayerFrameSource = {
    getCamera: () => ({ ...state.dm, width: state.pane.width / state.dm.scale, height: state.pane.height / state.dm.scale }),
    getScreen: () => state.pane,
    canRender: () => !state.lost,
    withPlayerSafeFrame: (copy, _settings, frame) => {
      rendered = frame;
      if (!state.rendersNothing) copy(wholeFrame(canvas, frame.width, frame.height));
    },
  };
  const target = document.createElement('canvas');
  const drawImage = vi.fn();
  const onFrame = vi.fn();
  const mirror = new PlayerFrameMirror(target, { clearRect: vi.fn(), drawImage } as unknown as CanvasRenderingContext2D, {
    source: () => source,
    window: () => state.window,
    heldFrame: () => null,
    frozenCamera: () => state.frozen,
    settings: () => SETTINGS,
    onFrame,
  }, () => 0);
  return {
    target, state, onFrame, drawImage,
    frame: () => {
      rendered = null;
      mirror.frame();
      return rendered;
    },
  };
}

describe('the frame the mirror renders for the player window', () => {
  it('has the window\'s own pixels and shape, whatever the pane\'s', () => {
    const { frame, target } = setup();
    const rendered = frame()!;
    expect(rendered).toMatchObject({ width: 1920, height: 1080, resolution: 1, centerX: 2000, centerY: 1000 });
    expect([target.width, target.height]).toEqual([1920, 1080]);
  });

  it('shows everything the pane shows, and map beside it where the window is wider', () => {
    const { frame } = setup();
    const view = shown(frame()!);
    // The pane shows 2400 × 1600 of the world: its height fills the window
    expect(view.height).toBeCloseTo(1600, 6);
    expect(view.width).toBeCloseTo(1600 * 1920 / 1080, 6);
    expect(view.left + view.width / 2).toBeCloseTo(2000, 6);
  });

  it('keeps the players\' scale when a sidebar makes the pane narrower', () => {
    const { frame, state } = setup();
    const before = frame()!;
    state.pane = { width: 900, height: 800, resolution: 1 };
    const after = frame()!;
    expect(after.scale).toBeCloseTo(before.scale, 10);
    expect([after.width, after.height]).toEqual([before.width, before.height]);
  });

  it('caps a 4K window at the pixel budget, in the window\'s shape', () => {
    const { frame, state, target } = setup();
    state.window = { width: 3840, height: 2160, resolution: 1 };
    const rendered = frame()!;
    expect([rendered.width, rendered.height]).toEqual([2560, 1440]);
    expect(rendered.width * rendered.height).toBe(PLAYER_FRAME_PIXEL_BUDGET);
    expect([target.width, target.height]).toEqual([2560, 1440]);
  });

  it('copies each piece to its place in the frame', () => {
    const { frame, drawImage } = setup();
    frame();
    expect(drawImage).toHaveBeenLastCalledWith(expect.anything(), 0, 0, 1920, 1080, 0, 0, 1920, 1080);
  });

  it('renders nothing for a window without a size, and a frame once it has one', () => {
    const { frame, state, target, onFrame } = setup();
    frame();
    onFrame.mockClear();
    state.window = { width: 0, height: 0, resolution: 1 };
    expect(frame()).toBeNull();
    state.window = null;
    expect(frame()).toBeNull();
    expect(onFrame).not.toHaveBeenCalled();
    // The last frame stands
    expect([target.width, target.height]).toEqual([1920, 1080]);

    state.window = { width: 640, height: 360, resolution: 1 };
    expect(frame()).toMatchObject({ width: 640, height: 360 });
  });

  it('keeps the last frame while nothing can be rendered: the canvas keeps its size and nothing is reported', () => {
    const { frame, state, target, onFrame, drawImage } = setup();
    frame();
    onFrame.mockClear();
    drawImage.mockClear();

    state.window = { width: 800, height: 450, resolution: 1 };
    state.rendersNothing = true;
    expect(frame()).not.toBeNull();
    expect([target.width, target.height]).toEqual([1920, 1080]);
    expect(drawImage).not.toHaveBeenCalled();
    expect(onFrame).not.toHaveBeenCalled();

    // Players are still owed the frame
    state.rendersNothing = false;
    frame();
    expect([target.width, target.height]).toEqual([800, 450]);
  });

  it('asks a view whose graphics context is lost for nothing, and for a frame once it is back', () => {
    const { frame, state, target } = setup();
    frame();
    state.lost = true;
    state.window = { width: 800, height: 450, resolution: 1 };
    expect(frame()).toBeNull();
    expect(frame()).toBeNull();
    expect([target.width, target.height]).toEqual([1920, 1080]);

    state.lost = false;
    expect(frame()).toMatchObject({ width: 800, height: 450 });
  });
});

describe('a DM view the mirror cannot read', () => {
  it.each([
    ['a pane without a size', (state: Harness['state']): void => { state.pane = { width: 0, height: 0, resolution: 1 }; }],
    ['a pane whose size is no number', (state: Harness['state']): void => { state.pane = { width: Number.NaN, height: 800, resolution: 1 }; }],
    ['a zoom of zero', (state: Harness['state']): void => { state.dm = { centerX: 2000, centerY: 1000, scale: 0 }; }],
    ['a zoom that is no number', (state: Harness['state']): void => { state.dm = { centerX: 2000, centerY: 1000, scale: Number.NaN }; }],
    ['a centre that is no number', (state: Harness['state']): void => { state.dm = { centerX: Number.NaN, centerY: 1000, scale: 0.5 }; }],
    ['an infinite centre', (state: Harness['state']): void => { state.dm = { centerX: 2000, centerY: Number.NEGATIVE_INFINITY, scale: 0.5 }; }],
  ])('renders nothing for %s and keeps the last frame, never a wider picture', (_name, degenerate) => {
    const { frame, state, target, onFrame, drawImage } = setup();
    const good = { pane: state.pane, dm: state.dm };
    frame();
    onFrame.mockClear();
    drawImage.mockClear();

    degenerate(state);
    expect(frame()).toBeNull();
    expect(frame()).toBeNull();
    expect(drawImage).not.toHaveBeenCalled();
    expect(onFrame).not.toHaveBeenCalled();
    expect([target.width, target.height]).toEqual([1920, 1080]);

    // And the frame the DM's view asks for once it can be read again
    Object.assign(state, good);
    expect(frame()).toMatchObject({ centerX: 2000, centerY: 1000 });
  });

  it('renders nothing for a view that has no camera yet', () => {
    const drawImage = vi.fn();
    const withPlayerSafeFrame = vi.fn();
    const mirror = new PlayerFrameMirror(document.createElement('canvas'), { clearRect: vi.fn(), drawImage } as unknown as CanvasRenderingContext2D, {
      source: () => ({ getScreen: () => ({ width: 1200, height: 800, resolution: 1 }), getCamera: () => undefined, withPlayerSafeFrame }),
      window: () => ({ width: 1920, height: 1080, resolution: 1 }),
      heldFrame: () => null,
      frozenCamera: () => null,
      settings: () => SETTINGS,
      onFrame: vi.fn(),
    }, () => 0);
    mirror.frame();
    mirror.frame();
    expect(withPlayerSafeFrame).not.toHaveBeenCalled();
    expect(drawImage).not.toHaveBeenCalled();
  });
});

describe('players frozen on a camera', () => {
  /** Frozen as the service freezes them: on the DM's camera with the world rectangle the pane showed. */
  function freeze({ state }: Harness): void {
    state.frozen = { ...state.dm, width: state.pane.width / state.dm.scale, height: state.pane.height / state.dm.scale };
  }

  it('keep the same world rectangle when the pane changes size, is hidden, or the DM pans and zooms', () => {
    const harness = setup();
    const { frame, state } = harness;
    freeze(harness);
    const frozen = frame()!;

    for (const pane of [{ width: 900, height: 800 }, { width: 1500, height: 300 }, { width: 2400, height: 1600 }, { width: 37, height: 911 }]) {
      state.pane = { ...pane, resolution: 1 };
      expect(frame()).toEqual(frozen);
    }
    state.pane = { width: 1200, height: 800, resolution: 2 };
    expect(frame()).toEqual(frozen);
    state.dm = { centerX: -50, centerY: 7000, scale: 3 };
    expect(frame()).toEqual(frozen);
  });

  it('follow the DM again once unfrozen', () => {
    const harness = setup();
    const { frame, state } = harness;
    freeze(harness);
    frame();
    state.dm = { centerX: 300, centerY: 400, scale: 1 };
    state.frozen = null;
    expect(frame()).toMatchObject({ centerX: 300, centerY: 400, scale: 1080 / 800 });
  });

  it('keep their rectangle in a player window of another size, drawn with that window\'s pixels', () => {
    const harness = setup();
    const { frame, state } = harness;
    freeze(harness);
    const before = shown(frame()!);
    state.window = { width: 1280, height: 720, resolution: 2 };
    const after = frame()!;
    expect([after.width, after.height]).toEqual([2560, 1440]);
    expect(shown(after).height).toBeCloseTo(before.height, 6);
    expect(shown(after).left).toBeCloseTo(before.left, 6);
  });

  it('on a camera without a rectangle of its own are shown what the DM\'s screen shows through it now', () => {
    const { frame, state } = setup();
    // As an older Atlas froze, and as a caller that only knows a camera in the DM's screen frames
    state.frozen = { centerX: 500, centerY: 500, scale: 2 };
    expect(shown(frame()!).height).toBeCloseTo(400, 6);
    state.pane = { width: 1200, height: 400, resolution: 1 };
    const narrow = shown(frame()!);
    expect(narrow.width).toBeCloseTo(600, 6);
    expect(narrow.left + narrow.width / 2).toBeCloseTo(500, 6);
  });
});

describe('a player window that changes on a view that renders on change', () => {
  it.each([
    ['is resized', { width: 1000, height: 700, resolution: 1 }, [1000, 700]],
    ['moves to a screen with another pixel ratio', { width: 1600, height: 1200, resolution: 1.25 }, [2000, 1500]],
  ] as const)('is owed a frame of its new size when it %s, though the DM canvas did not change', (_name, window, pixels) => {
    const { events, frame, dm, state, target } = mirroring();
    expect([target.width, target.height]).toEqual([1600, 1200]);

    frame(100);
    dm.tick(101);
    expect(events).toEqual([]);

    state.window = window;
    frame(200);
    dm.tick(201);
    expect(events).toEqual(MIRRORED);
    expect([target.width, target.height]).toEqual(pixels);

    // Once: an unchanged window asks for nothing more
    events.length = 0;
    frame(300);
    dm.tick(301);
    expect(events).toEqual([]);
  });

  it('renders nothing while a frame is held, however the window is resized, and a frame of the new size once it is released', () => {
    const { events, frame, dm, state, target } = mirroring();
    state.held = document.createElement('canvas');
    state.held.width = 1600;
    state.held.height = 1200;
    frame(100);
    state.window = { width: 700, height: 900, resolution: 1 };
    frame(200);
    dm.tick(201);
    frame(300);
    expect(events).toEqual(['draw:held']);
    // The held frame keeps its own pixels: the window fits it with CSS
    expect([target.width, target.height]).toEqual([1600, 1200]);

    events.length = 0;
    state.held = null;
    frame(400);
    dm.tick(401);
    expect(events).toEqual(MIRRORED);
    expect([target.width, target.height]).toEqual([700, 900]);
  });

  it('asks a view without a graphics context for no render, and mirrors once it has one again', () => {
    const { events, frame, dm, mirror } = mirroring();
    const requestRender = vi.spyOn(dm.source.beforeRender!, 'requestRender');
    let lost = true;
    dm.source.canRender = (): boolean => !lost;
    mirror.markStale();
    for (let time = 100; time < 1200; time += 8) frame(time);
    dm.change();
    dm.tick(1201);
    expect(events).toEqual(['render:dm']);
    expect(requestRender).not.toHaveBeenCalled();

    events.length = 0;
    lost = false;
    frame(1300);
    dm.tick(1301);
    expect(events).toEqual(MIRRORED);
  });

  it('lets a view give back its frame when another is presented, and when the mirror stops', () => {
    const { frame, dm, createDm, state, mirror } = mirroring();
    const release = vi.fn();
    dm.source.release = release;
    const next = createDm();
    const releaseNext = vi.fn();
    next.source.release = releaseNext;

    state.source = next.source;
    frame(100);
    expect(release).toHaveBeenCalledTimes(1);
    expect(releaseNext).not.toHaveBeenCalled();

    mirror.stop();
    expect(releaseNext).toHaveBeenCalledTimes(1);
  });
});
