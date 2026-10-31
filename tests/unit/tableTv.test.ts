import { describe, expect, it } from 'vitest';
import { calibratedTrim, cellPx, glideCamera, parseResolution, pxPerMM } from '../../src/app/services/tableTv';
import { tableTvPlayerFrame, targetCellPx, type TableTv } from '../../src/app/services/tableTvFrame';
import { DEFAULT_TABLE_TV_SETTINGS, readTableTvSettings } from '../../src/app/services/tableTvSettings';
import { playerFrame, viewOf } from '../../src/app/services/playerFrame';

describe('TrueScale geometry', () => {
  it('works out pixels per mm of glass from the diagonal', () => {
    expect(pxPerMM(3840, 2160, 55)).toBeCloseTo(3.153768, 5);
    expect(cellPx(3840, 2160, 55, 27)).toBeCloseTo(85.152, 2);
    expect(cellPx(3840, 2160, 55, 27, 103)).toBeCloseTo(85.152 * 1.03, 2);
    for (const bad of [0, -55, NaN]) expect(() => pxPerMM(3840, 2160, bad)).toThrow();
  });

  it('calibrates the trim from a measurement', () => {
    // 10 cells meant to be 270 mm measured 260 mm: grow by 270/260
    expect(calibratedTrim(100, 270, 260)).toBeCloseTo(103.85, 2);
    expect(calibratedTrim(100, 270, 0)).toBe(100);
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

  it('parses resolutions', () => {
    expect(parseResolution('3840x2160', { w: 1, h: 1 })).toEqual({ w: 3840, h: 2160 });
    expect(parseResolution('auto', { w: 1, h: 1 })).toEqual({ w: 1, h: 1 });
  });
});

describe("the players' frame on a table TV", () => {
  // A 55" 4K TV at a pixel ratio of 2, whatever size the GM's pane has
  const tv = (trueScale: boolean): TableTv => ({
    settings: { ...DEFAULT_TABLE_TV_SETTINGS, trueScale, diagonalIn: 55, resolution: '3840x2160', cellMm: 25 },
    devicePixelRatio: 2,
    screenPixels: () => ({ w: 3840, h: 2160 }),
  });
  const window = { width: 1920, height: 1080, resolution: 2 };
  const pane = { width: 1600, height: 1200, resolution: 1 };
  const camera = { centerX: 500, centerY: 400, scale: 1 };
  const upstream = playerFrame(window, viewOf(camera, pane)!, pane);

  it('makes a cell of the grid measure its size on the glass', () => {
    const frame = tableTvPlayerFrame(window, camera, pane, tv(true), 70)!;
    // 70 world pixels at the frame's zoom are the TV's device pixels for 25 mm
    expect(70 * frame.scale * 2).toBeCloseTo(targetCellPx(tv(true)));
    expect(frame).toMatchObject({ centerX: 500, centerY: 400, width: upstream!.width, height: upstream!.height });
  });

  it("is playerFrame's without true scale, without a grid, or without a TV", () => {
    expect(tableTvPlayerFrame(window, camera, pane, tv(false), 70)).toEqual(upstream);
    expect(tableTvPlayerFrame(window, camera, pane, tv(true), undefined)).toEqual(upstream);
    expect(tableTvPlayerFrame(window, camera, pane, undefined, 70)).toEqual(upstream);
  });
});

describe('the TrueScale settings as stored', () => {
  it('reads the defaults for nothing and for values it cannot use, and keeps fields it does not know', () => {
    expect(readTableTvSettings(undefined)).toEqual(DEFAULT_TABLE_TV_SETTINGS);
    expect(readTableTvSettings({ rotation: 45, diagonalIn: -1, cellMm: 'x', widgetScale: 9, widgetPosition: 'middle' }))
      .toEqual(DEFAULT_TABLE_TV_SETTINGS);
    expect(readTableTvSettings({ rotation: 270, trueScale: true, widgetScale: 1.5, later: 1 }))
      .toEqual({ ...DEFAULT_TABLE_TV_SETTINGS, rotation: 270, trueScale: true, widgetScale: 1.5, later: 1 });
  });
});
