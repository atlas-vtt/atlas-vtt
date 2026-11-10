// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Bounds, Text } from 'pixi.js';
import { MeasureLabel } from '../../src/app/pixi/utils/measureLabel';
import {
  LABEL_LOOK, MEASURE_DOT, labelCenter, labelScale, labelTextResolution, pillSize, placeLabel, type Size,
} from '../../src/app/pixi/utils/measureLabelLayout';
import { NAMEPLATE_HEIGHT, NAMEPLATE_TEXT, restingTokenUIScale, selectedTokenUIScale } from '../../src/app/pixi/token-renderer/tokenSizing';

const PILL: Size = { width: 50, height: 26 };
const GAP = 6;
/** What lies between the line's axis and the label beyond the gap: the dots and their dark edge. */
const CLEARANCE = MEASURE_DOT + 1 + GAP;

/** How far apart a box of `size` around `center` and the point `p` lie. */
function gapToBox(center: { x: number; y: number }, size: Size, p: { x: number; y: number }): number {
  return Math.hypot(Math.max(Math.abs(p.x - center.x) - size.width / 2, 0), Math.max(Math.abs(p.y - center.y) - size.height / 2, 0));
}

describe('labelScale', () => {
  it('is the scale of a selected token\'s UI: the nameplate\'s on the map zoomed in, never below its size on screen zoomed out', () => {
    for (const grid of [50, 70, 140]) {
      for (const zoom of [0.1, 0.5, 1, 3, 8]) expect(labelScale(grid, zoom)).toBe(selectedTokenUIScale(restingTokenUIScale(grid), zoom));
    }
    expect(labelScale(70, 8)).toBe(restingTokenUIScale(70));
    expect(labelScale(70, 0.1) * 0.1).toBeCloseTo(2.25);
  });
});

describe('labelTextResolution', () => {
  it('is the token UI\'s at the size a selected nameplate has on screen, and grows in whole steps as the label does', () => {
    expect(labelTextResolution(labelScale(70, 0.5), 0.5, 2)).toBe(3);
    expect(labelTextResolution(labelScale(70, 1), 1, 2)).toBe(3);
    // Zoomed in, the label grows with the map: 5 screen pixels per UI unit need more than 2.25 do.
    expect(labelTextResolution(labelScale(70, 5), 5, 2)).toBe(7);
    expect(labelTextResolution(labelScale(70, 1), 1, 3)).toBe(5);
    expect(labelTextResolution(labelScale(70, 40), 40, 2)).toBe(12);
    expect(Number.isInteger(labelTextResolution(1, 2.7, 2))).toBe(true);
  });
});

describe('pillSize', () => {
  it('is the nameplate\'s height, with fully rounded ends and the nameplate\'s padding beside the text', () => {
    expect(pillSize({ width: 20, height: 9.7 })).toEqual({ width: 20 + 2 * NAMEPLATE_TEXT.padding, height: NAMEPLATE_HEIGHT, radius: NAMEPLATE_HEIGHT / 2 });
    expect(LABEL_LOOK.gap).toBe(LABEL_LOOK.padding);
  });

  it('is never narrower than it is tall', () => {
    expect(pillSize({ width: 1, height: 9.7 })).toEqual({ width: NAMEPLATE_HEIGHT, height: NAMEPLATE_HEIGHT, radius: NAMEPLATE_HEIGHT / 2 });
  });
});

describe('placeLabel', () => {
  it('stands above the middle of a level line, clear of it by the gap', () => {
    const at = placeLabel([{ x: 0, y: 0 }, { x: 200, y: 0 }], PILL, GAP)!;
    expect(at.x).toBeCloseTo(100);
    expect(at.y).toBeCloseTo(-(PILL.height / 2 + CLEARANCE));
  });

  it('stands to the right of an upright line, whichever way it was drawn', () => {
    for (const path of [[{ x: 0, y: 0 }, { x: 0, y: 200 }], [{ x: 0, y: 200 }, { x: 0, y: 0 }]]) {
      const at = placeLabel(path, PILL, GAP)!;
      expect(at.x).toBeCloseTo(PILL.width / 2 + CLEARANCE);
      expect(at.y).toBeCloseTo(100);
    }
  });

  it('keeps off a slanted line and its middle', () => {
    const at = placeLabel([{ x: 0, y: 0 }, { x: 300, y: 200 }], PILL, GAP)!;
    expect(gapToBox(at, PILL, { x: 150, y: 100 })).toBeGreaterThanOrEqual(CLEARANCE - 1e-9);
    expect(at.y).toBeLessThan(100);
  });

  it('steps away from the token a drag ruler leads to until it no longer covers it', () => {
    const avoid = { x: 60, y: 0, radius: 35 };
    const at = placeLabel([{ x: 0, y: 0 }, { x: 60, y: 0 }], PILL, GAP, avoid)!;
    expect(gapToBox(at, PILL, avoid)).toBeGreaterThanOrEqual(avoid.radius + GAP);
    expect(at.x).toBeCloseTo(30);
  });

  it('stands above the point of a path without length, and nowhere without a point', () => {
    expect(placeLabel([{ x: 10, y: 10 }], PILL, GAP)).toEqual({ x: 10, y: 10 - PILL.height / 2 - CLEARANCE });
    expect(placeLabel([], PILL, GAP)).toBeNull();
  });
});

describe('labelCenter', () => {
  it('places in screen pixels at the zoom, and centres over a point exactly', () => {
    expect(labelCenter({ over: { x: 10, y: 20 } }, PILL, 3, GAP)).toEqual({ x: 30, y: 60 });
    expect(labelCenter({ beside: [{ x: 0, y: 0 }, { x: 100, y: 0 }] }, PILL, 2, GAP)!.x).toBeCloseTo(100);
  });
});

describe('MeasureLabel', () => {
  beforeEach(() => {
    // jsdom cannot measure text: the nameplate's 24 px font, about 29 px tall.
    vi.spyOn(Text.prototype, 'getLocalBounds').mockReturnValue(new Bounds(0, 0, 60, 29));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('is laid out as token UI: at a selected token\'s UI scale, in the nameplate\'s type, its text finer as it grows on screen', () => {
    const label = new MeasureLabel();
    const resolutions: number[] = [];
    for (const zoom of [0.1, 1, 3, 8]) {
      label.show('35 ft', { beside: [{ x: 0, y: 0 }, { x: 100, y: 0 }] }, zoom, 70);
      expect(label.view.scale.x).toBe(labelScale(70, zoom));
      expect(label.text.style.fontSize).toBe(NAMEPLATE_TEXT.fontSize);
      expect(label.text.scale.x).toBe(NAMEPLATE_TEXT.textScale);
      resolutions.push(label.text.resolution);
    }
    expect(resolutions).toEqual([3, 3, 4, 11]);
    label.destroy();
  });

  it('keeps the gap to the line in UI units, so it grows with the label', () => {
    const label = new MeasureLabel();
    const above = (zoom: number): number => {
      label.show('35 ft', { beside: [{ x: 0, y: 0 }, { x: 100, y: 0 }] }, zoom, 70);
      // From the line to the pill's lower edge, in screen pixels, less the dots' clearance.
      return -label.view.position.y * zoom - (NAMEPLATE_HEIGHT / 2) * labelScale(70, zoom) * zoom - MEASURE_DOT - 1;
    };
    expect(above(1)).toBeCloseTo(LABEL_LOOK.gap * 2.25);
    expect(above(8)).toBeCloseTo(LABEL_LOOK.gap * 8);
    label.destroy();
  });
});
