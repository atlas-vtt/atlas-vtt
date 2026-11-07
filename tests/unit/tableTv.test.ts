import { describe, expect, it, vi } from 'vitest';
import { CARD_MM, cellPx, firstGuessPxPerMm, glideCamera, pxPerMM } from '../../src/app/services/tableTv';
import { drawTvSetup, tableTvOf, tableTvPlayerFrame, targetCellPx, type TableTv } from '../../src/app/services/tableTvFrame';
import { DEFAULT_TABLE_TV_SETTINGS, readTableTvSettings } from '../../src/app/services/tableTvSettings';
import {
  DEFAULT_TABLE_TV_DEVICE, loadTableTvDevice, readTableTvDevice, saveTableTvDevice, screenKey, setupOf, TABLE_TV_STORAGE_KEY,
} from '../../src/app/services/tableTvDevice';
import { playerFrame, viewOf } from '../../src/app/services/playerFrame';
import { withSetupScreen } from '../../src/app/services/playerGlass';

describe('TrueScale geometry', () => {
  it('works out pixels per mm of glass from the diagonal', () => {
    expect(pxPerMM(3840, 2160, 55)).toBeCloseTo(3.153768, 5);
    expect(cellPx(3840, 2160, 55, 27)).toBeCloseTo(85.152, 2);
    for (const bad of [0, -55, NaN]) expect(() => pxPerMM(3840, 2160, bad)).toThrow();
  });

  it('starts the dial at a 55" TV, also for a screen without a size', () => {
    expect(firstGuessPxPerMm(3840, 2160)).toBeCloseTo(pxPerMM(3840, 2160, 55));
    expect(firstGuessPxPerMm(1920, 1080)).toBeCloseTo(pxPerMM(3840, 2160, 55) / 2);
    expect(firstGuessPxPerMm(0, 0)).toBeCloseTo(pxPerMM(3840, 2160, 55));
  });

  it('glides the camera with eased motion and even zoom', () => {
    const a = { centerX: 0, centerY: 0, scale: 1 };
    const b = { centerX: 100, centerY: -50, scale: 4 };
    expect(glideCamera(a, b, 0)).toEqual(a);
    expect(glideCamera(a, b, 1)).toEqual(b);
    const mid = glideCamera(a, b, 0.5);
    expect(mid.centerX).toBeCloseTo(50);
    expect(mid.scale).toBeCloseTo(2);
    expect(glideCamera(a, b, 0.1).centerX).toBeLessThan(10);
  });
});

/** A 4K TV at a pixel ratio of 2 with 25 mm cells, fitted at `perMm` device pixels per mm, or never fitted. */
function tv(trueScale: boolean, perMm: number | null = 3.2): TableTv {
  return {
    prefs: DEFAULT_TABLE_TV_SETTINGS, trueScale, cellMm: 25, setup: perMm === null ? null : { pxPerMm: perMm, rotation: 90 }, rotation: 90,
    devicePixelRatio: 2, screenKey: '3840x2160',
  };
}

describe("the players' frame on a table TV", () => {
  const window = { width: 1920, height: 1080, resolution: 2 };
  const pane = { width: 1600, height: 1200, resolution: 1 };
  const camera = { centerX: 500, centerY: 400, scale: 1 };
  const upstream = playerFrame(window, viewOf(camera, pane)!, pane);

  it('makes a cell of the grid measure its size on the glass', () => {
    const frame = tableTvPlayerFrame(window, camera, pane, tv(true), 70)!;
    // 70 world pixels at the frame's zoom are 25 mm of 3.2 device pixels each
    expect(70 * frame.scale * 2).toBeCloseTo(80);
    expect(frame).toMatchObject({ centerX: 500, centerY: 400, width: upstream!.width, height: upstream!.height });
  });

  it("is playerFrame's without true scale, without a setup, without a grid, or without a TV", () => {
    expect(tableTvPlayerFrame(window, camera, pane, tv(false), 70)).toEqual(upstream);
    expect(tableTvPlayerFrame(window, camera, pane, tv(true, null), 70)).toEqual(upstream);
    expect(tableTvPlayerFrame(window, camera, pane, tv(true), undefined)).toEqual(upstream);
    expect(tableTvPlayerFrame(window, camera, pane, undefined, 70)).toEqual(upstream);
  });

  it('has no target cell on a screen never fitted', () => {
    expect(targetCellPx(tv(true, null))).toBeNull();
    expect(targetCellPx(tv(true))).toBeCloseTo(80);
    expect(targetCellPx({ ...tv(true), cellMm: 25.4 })).toBeCloseTo(81.28);
  });

  it('follows the dial while a card is fitted, at true scale, and is the TV as it is otherwise', () => {
    const fitting = withSetupScreen(tv(false, null), { kind: 'fit', pxPerMm: 4.8 });
    expect(fitting).toMatchObject({ trueScale: true, setup: { pxPerMm: 4.8, rotation: 90 } });
    expect(70 * tableTvPlayerFrame(window, camera, pane, fitting, 70)!.scale * 2).toBeCloseTo(120);
    const turning = tv(false);
    expect(withSetupScreen(turning, { kind: 'orientation' })).toBe(turning);
    expect(withSetupScreen(turning, null)).toBe(turning);
  });
});

describe('the table TV a window is', () => {
  const win = { devicePixelRatio: 2, screen: { width: 1920, height: 1080 } } as unknown as Window;

  it("reads its screen's setup by the screen's device pixels", () => {
    const device = { trueScale: true, cellMm: 30, screens: { '3840x2160': { pxPerMm: 3.1, rotation: 180 as const }, '1920x1080': { pxPerMm: 1.5, rotation: 0 as const } } };
    expect(tableTvOf(win, DEFAULT_TABLE_TV_SETTINGS, device)).toEqual({
      prefs: DEFAULT_TABLE_TV_SETTINGS, trueScale: true, cellMm: 30, setup: { pxPerMm: 3.1, rotation: 180 }, rotation: 180, devicePixelRatio: 2, screenKey: '3840x2160',
    });
  });

  it('turns a screen being set up before it is fitted, and has no setup for it yet', () => {
    const device = { trueScale: false, cellMm: 25.4, screens: { '3840x2160': { rotation: 270 as const } } };
    expect(tableTvOf(win, DEFAULT_TABLE_TV_SETTINGS, device)).toMatchObject({ setup: null, rotation: 270 });
    expect(tableTvOf(win, DEFAULT_TABLE_TV_SETTINGS, DEFAULT_TABLE_TV_DEVICE)).toMatchObject({ setup: null, rotation: 0 });
  });
});

describe('the TrueScale settings as stored', () => {
  it('reads the defaults for nothing and for values it cannot use, and keeps fields it does not know', () => {
    expect(readTableTvSettings(undefined)).toEqual(DEFAULT_TABLE_TV_SETTINGS);
    expect(readTableTvSettings({ viewGlideMs: -1 })).toEqual(DEFAULT_TABLE_TV_SETTINGS);
    // An earlier build's TV fields stay where they are, unread
    expect(readTableTvSettings({ rotation: 270, trueScale: true, widgetScale: 1.5, widgetPosition: 'bottom', later: 1 }))
      .toEqual({ ...DEFAULT_TABLE_TV_SETTINGS, rotation: 270, trueScale: true, widgetScale: 1.5, widgetPosition: 'bottom', later: 1 });
  });
});

describe("this device's table TVs", () => {
  function storage(): Parameters<typeof loadTableTvDevice>[0] & { stored: Map<string, unknown> } {
    const stored = new Map<string, unknown>();
    return {
      stored,
      loadLocalStorage: (key: string) => stored.get(key) ?? null,
      saveLocalStorage: (key: string, value: unknown) => { stored.set(key, value); },
    };
  }

  it('names a screen by its device pixels', () => {
    expect(screenKey(3840, 2160)).toBe('3840x2160');
    expect(screenKey(1919.6, 1080.2)).toBe('1920x1080');
  });

  it('reads the default where nothing or nothing usable is stored', () => {
    expect(loadTableTvDevice(storage())).toEqual(DEFAULT_TABLE_TV_DEVICE);
    const broken = storage();
    broken.stored.set(TABLE_TV_STORAGE_KEY, '{not json');
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(loadTableTvDevice(broken)).toEqual(DEFAULT_TABLE_TV_DEVICE);
    expect(readTableTvDevice({ trueScale: 'yes', cellMm: -2, screens: 3 })).toEqual(DEFAULT_TABLE_TV_DEVICE);
    expect(DEFAULT_TABLE_TV_DEVICE.cellMm).toBe(25.4);
  });

  it('keeps every screen and what a newer Atlas stored, and reads what of a screen it cannot use as unset', () => {
    // A cell none of the choices offer, but positive, is kept
    expect(readTableTvDevice({
      trueScale: true, cellMm: 28, later: 1,
      screens: { a: { pxPerMm: 3.15, rotation: 90, extra: true }, b: { pxPerMm: -3, rotation: 45 }, c: 'tv', d: { rotation: 180 } },
    })).toEqual({
      trueScale: true, cellMm: 28, later: 1,
      screens: { a: { pxPerMm: 3.15, rotation: 90, extra: true }, b: { rotation: 0 }, d: { rotation: 180 } },
    });
  });

  it('saves what it reads back', () => {
    const local = storage();
    const device = { trueScale: true, cellMm: 30, screens: { '3840x2160': { pxPerMm: 3.15, rotation: 270 as const }, '1920x1080': { rotation: 90 as const } } };
    saveTableTvDevice(local, device);
    expect(typeof local.stored.get(TABLE_TV_STORAGE_KEY)).toBe('string');
    expect(loadTableTvDevice(local)).toEqual(device);
  });

  it('has a setup only for a screen fitted to a card', () => {
    const device = { trueScale: true, cellMm: 25.4, screens: { fitted: { pxPerMm: 3.15, rotation: 90 as const }, turned: { rotation: 90 as const } } };
    expect(setupOf(device, 'fitted')).toEqual({ pxPerMm: 3.15, rotation: 90 });
    expect(setupOf(device, 'turned')).toBeNull();
    expect(setupOf(device, 'unknown')).toBeNull();
  });
});

describe('the set-up screen on the TV', () => {
  /** A stand-in 2D context that records what is drawn. */
  function context(): CanvasRenderingContext2D & { calls: string[]; texts: string[]; points: number[][] } {
    const calls: string[] = [];
    const texts: string[] = [];
    const points: number[][] = [];
    const record = (name: string) => (...args: unknown[]): void => {
      calls.push(name);
      if (name === 'fillText') texts.push(String(args[0]));
      if (name === 'arcTo') points.push((args as number[]).slice(0, 2));
    };
    const measureText = function (this: { font: string }, text: string): { width: number } {
      return { width: text.length * parseFloat(this.font.replace('600 ', '')) * 0.5 };
    };
    const methods = ['save', 'restore', 'fillRect', 'fillText', 'beginPath', 'moveTo', 'lineTo', 'arcTo', 'closePath', 'fill', 'stroke'];
    return Object.assign(Object.fromEntries(methods.map((name) => [name, record(name)])), { calls, texts, points, font: '', measureText }) as never;
  }
  const frame = { width: 2560, height: 1440, resolution: 2 };

  it('shades the frame and shows an arrow pointing up with its words', () => {
    const ctx = context();
    drawTvSetup(ctx, frame, { kind: 'orientation' }, tv(false));
    expect(ctx.calls).toContain('fill');
    expect(ctx.calls.indexOf('fillRect')).toBeLessThan(ctx.calls.indexOf('fill'));
    expect(ctx.texts).toEqual(['TrueScale setup · the map at real size on this screen', 'Which way is up?', 'Turn the picture until the arrow points away from the players']);
    expect(ctx.calls.at(-1)).toBe('restore');
  });

  it("outlines a bank card at the dial's pixels per mm, centred, its inner edge the card's", () => {
    const ctx = context();
    // 4 device pixels per mm at a pixel ratio of 2 are 2 points, 4 frame pixels at a resolution of 2
    drawTvSetup(ctx, frame, { kind: 'fit', pxPerMm: 4 }, tv(false));
    expect(ctx.texts).toEqual([
      'TrueScale setup · the map at real size on this screen',
      'Lay a bank or credit card inside the outline',
      'Atlas measures this screen with it',
    ]);
    expect(ctx.calls).toContain('stroke');
    // The corners the path turns at: the outline is the card plus half its line (3 frame px: a 1.5 px line at resolution 2) on every side
    const xs = ctx.points.map(([x]) => x!);
    const ys = ctx.points.map(([, y]) => y!);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(CARD_MM.width * 4 + 3);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(CARD_MM.height * 4 + 3);
    expect((Math.max(...xs) + Math.min(...xs)) / 2).toBeCloseTo(1280);
    expect((Math.max(...ys) + Math.min(...ys)) / 2).toBeCloseTo(720);
  });

  it('keeps every line within a screen turned a quarter', () => {
    const ctx = context();
    const widths: number[] = [];
    const fillText = ctx.fillText.bind(ctx);
    ctx.fillText = (text: string, x: number, y: number): void => {
      widths.push(ctx.measureText(text).width);
      fillText(text, x, y);
    };
    drawTvSetup(ctx, { width: 1080, height: 1920, resolution: 1 }, { kind: 'fit', pxPerMm: 4 }, tv(false));
    expect(widths).toHaveLength(3);
    expect(Math.max(...widths)).toBeLessThanOrEqual(1080);
  });
});
