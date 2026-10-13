import { describe, expect, it } from 'vitest';
import { MAX_FRAME_PIECES } from '../../src/app/pixi/PlayerFrameTexture';
import { framedCamera, playerFrame, PLAYER_FRAME_PIXEL_BUDGET, viewOf } from '../../src/app/services/playerFrame';
import type { PlayerFrame, Screen, WorldView } from '../../src/app/types/playerFrame';

function screen(width: number, height: number, resolution = 1): Screen {
  return { width, height, resolution };
}

/** What the GM's pane of that size shows at `scale`, centred on (1000, 500). */
function paneView(width: number, height: number, scale = 1): WorldView {
  return { centerX: 1000, centerY: 500, width: width / scale, height: height / scale };
}

/** The world rectangle a frame shows, in world pixels. */
function shown(frame: PlayerFrame): { left: number; right: number; top: number; bottom: number } {
  const width = frame.width / frame.resolution / frame.scale;
  const height = frame.height / frame.resolution / frame.scale;
  return { left: frame.centerX - width / 2, right: frame.centerX + width / 2, top: frame.centerY - height / 2, bottom: frame.centerY + height / 2 };
}

function contains(frame: PlayerFrame, view: WorldView): boolean {
  const { left, right, top, bottom } = shown(frame);
  const slack = 1e-6;
  return left <= view.centerX - view.width / 2 + slack && right >= view.centerX + view.width / 2 - slack
    && top <= view.centerY - view.height / 2 + slack && bottom >= view.centerY + view.height / 2 - slack;
}

describe('the players\' frame for a window', () => {
  it('shows exactly the GM\'s view in a window of the same shape, with the window\'s own pixels', () => {
    const view = paneView(1600, 900, 0.5);
    const frame = playerFrame(screen(1920, 1080), view, screen(1600, 900))!;
    expect(frame).toMatchObject({ width: 1920, height: 1080, resolution: 1, centerX: 1000, centerY: 500 });
    expect(frame.scale).toBeCloseTo(0.6, 10);
    expect(shown(frame).left).toBeCloseTo(1000 - 1600, 6);
    expect(shown(frame).top).toBeCloseTo(500 - 900, 6);
  });

  it('keeps its scale when the pane gets narrower: the height decides, and players see map beside the GM\'s view', () => {
    const before = playerFrame(screen(1920, 1080), paneView(1600, 900), screen(1600, 900))!;
    const narrower = paneView(1300, 900);
    const after = playerFrame(screen(1920, 1080), narrower, screen(1300, 900))!;
    expect(after.scale).toBeCloseTo(before.scale, 10);
    expect(contains(after, narrower)).toBe(true);
    expect(shown(after).left).toBeLessThan(narrower.centerX - narrower.width / 2 - 100);
  });

  it('fits a pane wider than the window by its width, and shows map above and below', () => {
    const view = paneView(2400, 600);
    const frame = playerFrame(screen(1920, 1080), view, screen(2400, 600))!;
    expect(frame.scale).toBeCloseTo(1920 / 2400, 10);
    expect(contains(frame, view)).toBe(true);
    expect(shown(frame).top).toBeLessThan(view.centerY - view.height / 2 - 100);
  });

  it('fits a pane taller than the window by its height', () => {
    const view = paneView(600, 1200);
    const frame = playerFrame(screen(1920, 1080), view, screen(600, 1200))!;
    expect(frame.scale).toBeCloseTo(1080 / 1200, 10);
    expect(contains(frame, view)).toBe(true);
  });

  it('never shows less than the view, whatever the two shapes', () => {
    for (const [windowWidth, windowHeight] of [[1920, 1080], [1080, 1920], [800, 800], [3440, 1440], [317, 211]] as const) {
      for (const [paneWidth, paneHeight] of [[1200, 800], [900, 800], [1200, 300], [333, 777]] as const) {
        const view = paneView(paneWidth, paneHeight, 0.37);
        const frame = playerFrame(screen(windowWidth, windowHeight), view, screen(paneWidth, paneHeight))!;
        expect(contains(frame, view)).toBe(true);
        // One side of the view fills the window: nothing is smaller than it has to be
        const fill = Math.max(view.width * frame.scale / windowWidth, view.height * frame.scale / (frame.height / frame.resolution));
        expect(fill).toBeCloseTo(1, 6);
      }
    }
  });

  it('gives a 4K window beside a small pane a frame of its shape within the budget', () => {
    const view = paneView(1200, 800);
    const frame = playerFrame(screen(3840, 2160), view, screen(1200, 800))!;
    expect([frame.width, frame.height]).toEqual([2560, 1440]);
    expect(frame.width * frame.height).toBe(PLAYER_FRAME_PIXEL_BUDGET);
    expect(frame.resolution).toBeCloseTo(2 / 3, 10);
    // In the window's points the frame is the window: the pane's height fills it
    expect(frame.scale).toBeCloseTo(2160 / 800, 10);
    expect(contains(frame, view)).toBe(true);
  });

  it('keeps the window\'s shape under the budget, to the pixel', () => {
    for (const [width, height] of [[3840, 2160], [5120, 1440], [2160, 3840], [3000, 3000], [7680, 4320]] as const) {
      const frame = playerFrame(screen(width, height), paneView(1200, 800), screen(1200, 800))!;
      expect(Math.abs(frame.width / frame.height - width / height)).toBeLessThan(1 / Math.min(frame.width, frame.height));
      expect(Math.abs(frame.width * frame.height - PLAYER_FRAME_PIXEL_BUDGET)).toBeLessThanOrEqual(frame.width + frame.height);
    }
  });

  it('never renders fewer pixels than the pane has', () => {
    const pane = screen(1728, 1000, 2);
    const panePixels = 3456 * 2000;
    const frame = playerFrame(screen(3840, 2160), paneView(1728, 1000), pane)!;
    expect(panePixels).toBeGreaterThan(PLAYER_FRAME_PIXEL_BUDGET);
    expect(Math.abs(frame.width * frame.height - panePixels)).toBeLessThanOrEqual(frame.width + frame.height);
    // A window smaller than the pane is rendered as it is
    expect(playerFrame(screen(1280, 720), paneView(1728, 1000), pane)).toMatchObject({ width: 1280, height: 720 });
  });

  it.each([
    { ratio: 1, pixels: [1536, 864] },
    { ratio: 1.25, pixels: [1920, 1080] },
    { ratio: 1.5, pixels: [2304, 1296] },
    { ratio: 2, pixels: [3072, 1728] },
  ])('has the window\'s device pixels at a pixel ratio of $ratio', ({ ratio, pixels }) => {
    const view = paneView(1200, 800);
    const frame = playerFrame(screen(1536, 864, ratio), view, screen(1200, 800))!;
    const capped = pixels[0]! * pixels[1]! > PLAYER_FRAME_PIXEL_BUDGET;
    if (!capped) expect([frame.width, frame.height]).toEqual(pixels);
    expect(frame.width * frame.height).toBeLessThanOrEqual(PLAYER_FRAME_PIXEL_BUDGET + frame.width + frame.height);
    expect(frame.resolution).toBeCloseTo(frame.width / 1536, 10);
    // The same picture at every ratio: the scale is in the window's points
    expect(frame.scale).toBeCloseTo(864 / 800, 3);
    expect(contains(frame, view)).toBe(true);
  });

  it('smooths edges below two pixels per point, and only within the budget', () => {
    const view = paneView(1200, 800);
    expect(playerFrame(screen(1920, 1080), view)!.antialias).toBe(true);
    expect(playerFrame(screen(1536, 864, 1.25), view)!.antialias).toBe(true);
    expect(playerFrame(screen(1280, 720, 2), view)!.antialias).toBe(false);
    // Capped: fewer than two of its pixels to a point of the window
    expect(playerFrame(screen(1920, 1080, 2), view)!.antialias).toBe(true);
    // A pane with more pixels than the budget lifts the cap, not the cost of smoothing
    expect(playerFrame(screen(3840, 2160), view, screen(3456, 2000))!.antialias).toBe(false);
  });

  it('renders a tiny window as it is', () => {
    expect(playerFrame(screen(1, 1), paneView(1200, 800))).toMatchObject({ width: 1, height: 1, resolution: 1 });
    expect(playerFrame(screen(3, 2, 0.5), paneView(1200, 800))).toMatchObject({ width: 2, height: 1 });
  });

  it.each([
    ['a window without a width', screen(0, 600)],
    ['a window without a height', screen(800, 0)],
    ['a window smaller than a pixel', screen(0.2, 0.2)],
    ['a negative size', screen(-800, 600)],
    ['a size that is no number', screen(Number.NaN, 600)],
    ['an infinite size', screen(Number.POSITIVE_INFINITY, 600)],
    ['a pixel ratio of zero', screen(800, 600, 0)],
    ['a pixel ratio that is no number', screen(800, 600, Number.NaN)],
  ])('renders nothing for %s', (_name, window) => {
    expect(playerFrame(window, paneView(1200, 800))).toBeNull();
  });

  it.each([
    ['no width', { centerX: 0, centerY: 0, width: 0, height: 10 }],
    ['a negative height', { centerX: 0, centerY: 0, width: 10, height: -10 }],
    ['a size that is no number', { centerX: 0, centerY: 0, width: Number.NaN, height: 10 }],
    ['an infinite size', { centerX: 0, centerY: 0, width: Number.POSITIVE_INFINITY, height: 10 }],
    ['a centre that is no number', { centerX: Number.NaN, centerY: 0, width: 10, height: 10 }],
  ])('renders nothing for a view with %s', (_name, view) => {
    expect(playerFrame(screen(800, 600), view)).toBeNull();
  });

  it('ignores a pane without a size', () => {
    const frame = playerFrame(screen(3840, 2160), paneView(1200, 800), screen(0, Number.NaN, Number.NaN))!;
    expect([frame.width, frame.height]).toEqual([2560, 1440]);
  });
});

describe('the pieces a frame is brought across in', () => {
  /** The pieces of the pane's canvas a frame takes. */
  function pieces(frame: PlayerFrame, pane: Screen): number {
    const canvas = { width: Math.round(pane.width * pane.resolution), height: Math.round(pane.height * pane.resolution) };
    return Math.ceil(frame.width / canvas.width) * Math.ceil(frame.height / canvas.height);
  }

  it('leaves a frame as it is while it takes no more pieces than allowed', () => {
    const pane = screen(1200, 800);
    const frame = playerFrame(screen(2560, 1440), paneView(1200, 800), pane)!;
    expect([frame.width, frame.height]).toEqual([2560, 1440]);
    expect(pieces(frame, pane)).toBe(6);
    // Twelve pieces from a pane of 800 × 600
    expect(playerFrame(screen(2560, 1440), paneView(800, 600), screen(800, 600))).toMatchObject({ width: 2560, height: 1440 });
  });

  it.each([
    ['a pane dragged almost shut', 1200, 20],
    ['a sliver', 1200, 4],
    ['a narrow strip', 30, 800],
    ['a small pane', 300, 200],
    ['a pane of a few pixels', 3, 2],
  ])('renders a smaller frame of the window\'s shape for %s, so that it takes no more pieces', (_name, width, height) => {
    const pane = screen(width, height);
    const view = paneView(width, height);
    const frame = playerFrame(screen(2560, 1440), view, pane)!;
    expect(pieces(frame, pane)).toBeLessThanOrEqual(MAX_FRAME_PIECES);
    expect(frame.width).toBeLessThan(2560);
    expect(Math.abs(frame.width / frame.height - 2560 / 1440)).toBeLessThan(2 / Math.min(frame.width, frame.height));
    // Still all the view, in the same place: only its pixels are fewer
    expect(contains(frame, view)).toBe(true);
    expect(frame.resolution).toBeCloseTo(frame.width / 2560, 10);
  });

  it('uses the pieces it may: the frame is as large as they allow', () => {
    // 300 × 200: four columns of 300 and four rows of 200 hold a frame of 1200 × 675
    const frame = playerFrame(screen(2560, 1440), paneView(300, 200), screen(300, 200))!;
    expect([frame.width, frame.height]).toEqual([1200, 675]);
  });

  it('never takes more pieces than allowed, for any window and pane', () => {
    let state = 393;
    const random = (): number => {
      state = (Math.imul(state, 1664525) + 1013904223) | 0;
      return (state >>> 0) / 4294967296;
    };
    const pick = (low: number, high: number): number => low * (high / low) ** random();
    for (let trial = 0; trial < 5000; trial++) {
      const pane = screen(Math.ceil(pick(1, 3000)), Math.ceil(pick(1, 3000)), [1, 1.25, 1.5, 2][trial % 4]!);
      const window = screen(Math.ceil(pick(1, 6000)), Math.ceil(pick(1, 6000)), [1, 1.5, 2][trial % 3]!);
      const frame = playerFrame(window, paneView(pane.width, pane.height), pane)!;
      expect(pieces(frame, pane)).toBeLessThanOrEqual(MAX_FRAME_PIECES);
      expect(frame.width).toBeGreaterThanOrEqual(1);
      expect(frame.height).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('how much of the world a frame can show', () => {
  /** A repeatable sequence of numbers between 0 and 1. */
  function seeded(seed: number): () => number {
    let state = seed;
    return () => {
      state = (Math.imul(state, 1664525) + 1013904223) | 0;
      return (state >>> 0) / 4294967296;
    };
  }

  /** The largest rectangle a frame of that shape may show of `view`: the smallest of the shape that holds it. */
  function bound(view: WorldView, aspect: number): { width: number; height: number } {
    return { width: Math.max(view.width, view.height * aspect), height: Math.max(view.height, view.width / aspect) };
  }

  it('is never more than the smallest rectangle of the window\'s shape around the view, for any window, view and pane', () => {
    const random = seeded(316);
    const pick = (low: number, high: number): number => low * (high / low) ** random();
    for (let trial = 0; trial < 5000; trial++) {
      const window = screen(pick(1, 8000), pick(1, 8000), [1, 1.25, 1.5, 2, 3][trial % 5]!);
      const view: WorldView = { centerX: (random() - 0.5) * 1e5, centerY: (random() - 0.5) * 1e5, width: pick(1e-3, 1e6), height: pick(1e-3, 1e6) };
      const pane = trial % 3 === 0 ? undefined : screen(pick(1, 4000), pick(1, 4000), [1, 2][trial % 2]!);
      const frame = playerFrame(window, view, pane);
      if (!frame) continue;
      // The frame's pixels are whole, so its shape is the window's to within a pixel: the bound is for the frame's own shape
      const most = bound(view, frame.width / frame.height);
      const slack = 1 + 1e-9;
      expect(frame.width / frame.resolution / frame.scale).toBeLessThanOrEqual(most.width * slack);
      expect(frame.height / frame.resolution / frame.scale).toBeLessThanOrEqual(most.height * slack);
      // And it is centred on the view, so it reaches no farther on one side than on the other
      expect([frame.centerX, frame.centerY]).toEqual([view.centerX, view.centerY]);
    }
  });

  it('never shows players more when the pane gets smaller, down to a sliver', () => {
    const window = screen(1920, 1080);
    const area = (pane: { width: number; height: number }): { width: number; height: number } => {
      const frame = playerFrame(window, paneView(pane.width, pane.height), screen(pane.width, pane.height))!;
      const { left, right, top, bottom } = shown(frame);
      return { width: right - left, height: bottom - top };
    };
    const whole = area({ width: 1200, height: 800 });
    for (const pane of [{ width: 900, height: 800 }, { width: 1200, height: 300 }, { width: 3, height: 800 }, { width: 1200, height: 2 }, { width: 1, height: 1 }, { width: 0.5, height: 0.5 }]) {
      const smaller = area(pane);
      expect(smaller.width).toBeLessThanOrEqual(whole.width + 1e-9);
      expect(smaller.height).toBeLessThanOrEqual(whole.height + 1e-9);
    }
  });

  it.each([
    ['a pane without a width', { width: 0, height: 800 }, 1],
    ['a pane without a height', { width: 1200, height: 0 }, 1],
    ['a pane of a negative size', { width: -1200, height: 800 }, 1],
    ['a pane whose size is no number', { width: Number.NaN, height: 800 }, 1],
    ['a pane of an infinite size', { width: Number.POSITIVE_INFINITY, height: 800 }, 1],
    ['a zoom of zero', { width: 1200, height: 800 }, 0],
    ['a negative zoom', { width: 1200, height: 800 }, -1],
    ['a zoom that is no number', { width: 1200, height: 800 }, Number.NaN],
    ['an infinite zoom', { width: 1200, height: 800 }, Number.POSITIVE_INFINITY],
  ])('has no view to show for %s: nothing is rendered, never a wider picture', (_name, pane, scale) => {
    expect(viewOf({ centerX: 10, centerY: 20, scale }, pane)).toBeNull();
  });

  it.each([
    ['no number', Number.NaN],
    ['infinite', Number.POSITIVE_INFINITY],
  ])('has no view to show around a centre that is %s', (_name, centre) => {
    expect(viewOf({ centerX: centre, centerY: 20, scale: 1 }, { width: 1200, height: 800 })).toBeNull();
    expect(viewOf({ centerX: 10, centerY: centre, scale: 1, width: 600, height: 400 }, undefined)).toBeNull();
  });

  it.each([
    ['sides too small to divide by', { centerX: 0, centerY: 0, width: 1e-320, height: 1e-320 }],
    ['one side too small to divide by', { centerX: 0, centerY: 0, width: 1e-320, height: 400 }],
    ['sides so small that the scale is no number', { centerX: 0, centerY: 0, width: 1e-306, height: 1e-306 }],
  ])('renders nothing for a view with %s: no frame has a scale that is not a positive finite number', (_name, view) => {
    expect(playerFrame(screen(1920, 1080), view)).toBeNull();
    expect(playerFrame(screen(8000, 6000, 2), view, screen(1200, 800))).toBeNull();
  });

  it('has no view to show through a camera whose rectangle or zoom is too small to divide by', () => {
    expect(viewOf({ centerX: 10, centerY: 20, scale: 2, width: 1e-320, height: 1e-320 }, { width: 1200, height: 800 })).toBeNull();
    expect(viewOf({ centerX: 10, centerY: 20, scale: 1e-320 }, { width: 1200, height: 800 })).toBeNull();
  });

  it('gives every frame it renders a scale that is a positive finite number', () => {
    for (const side of [1e-300, 1e-200, 1e-100, 1e-9, 1, 1e9, 1e100, 1e200, 1e300, Number.MAX_VALUE, Number.MIN_VALUE]) {
      const frame = playerFrame(screen(1920, 1080), { centerX: 0, centerY: 0, width: side, height: side });
      if (frame) expect(Number.isFinite(frame.scale) && frame.scale > 0).toBe(true);
    }
  });

  it('takes no rectangle from a camera whose own is no size, and falls back to nothing larger', () => {
    for (const rectangle of [{ width: 0, height: 400 }, { width: 600, height: -1 }, { width: Number.NaN, height: 400 }, { width: Number.POSITIVE_INFINITY, height: 400 }]) {
      expect(viewOf({ centerX: 10, centerY: 20, scale: 2, ...rectangle }, { width: 1200, height: 800 })).toBeNull();
    }
  });
});

describe('the world rectangle a camera frames', () => {
  it('is what the GM\'s screen shows at the camera\'s scale', () => {
    expect(viewOf({ centerX: 10, centerY: 20, scale: 2 }, { width: 1200, height: 800 })).toEqual({ centerX: 10, centerY: 20, width: 600, height: 400 });
  });

  it('is the camera\'s own rectangle where it has one, whatever the screen', () => {
    const camera = { centerX: 10, centerY: 20, scale: 2, width: 300, height: 100 };
    expect(viewOf(camera, { width: 1200, height: 800 })).toEqual({ centerX: 10, centerY: 20, width: 300, height: 100 });
    expect(viewOf(camera, undefined)).toEqual({ centerX: 10, centerY: 20, width: 300, height: 100 });
  });

  it('is unknown without a rectangle and without a screen, or from numbers that are none', () => {
    expect(viewOf({ centerX: 10, centerY: 20, scale: 2 }, undefined)).toBeNull();
    expect(viewOf({ centerX: 10, centerY: 20, scale: 0 }, { width: 1200, height: 800 })).toBeNull();
    expect(viewOf({ centerX: Number.NaN, centerY: 20, scale: 1 }, { width: 1200, height: 800 })).toBeNull();
    expect(viewOf({ centerX: 10, centerY: 20, scale: 1, width: -5, height: 5 }, undefined)).toBeNull();
    // Half a rectangle is none: the screen decides
    expect(viewOf({ centerX: 10, centerY: 20, scale: 2, width: 300 }, { width: 1200, height: 800 })).toMatchObject({ width: 600, height: 400 });
  });

  it('is pinned into a camera, which then keeps it on any screen', () => {
    const pinned = framedCamera({ centerX: 10, centerY: 20, scale: 2 }, { width: 1200, height: 800 });
    expect(pinned).toEqual({ centerX: 10, centerY: 20, scale: 2, width: 600, height: 400 });
    expect(framedCamera(pinned, { width: 300, height: 300 })).toBe(pinned);
    expect(viewOf(pinned, { width: 300, height: 300 })).toMatchObject({ width: 600, height: 400 });
    const unknown = { centerX: 10, centerY: 20, scale: 2 };
    expect(framedCamera(unknown, undefined)).toBe(unknown);
  });
});
