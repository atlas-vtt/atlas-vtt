import { describe, expect, it } from 'vitest';
import { PALETTE_MAX_WIDTH, PALETTE_MIN_WIDTH, PALETTE_VIEW_MARGIN, placePalette, placePaletteAtTop } from '../../src/app/react/components/command-palette/palettePlacement';

const frame = (width: number) => ({ left: 100, top: 0, width, bottom: 700 });
const toolbar = (left: number, width: number) => ({ left, top: 620, width, bottom: 678 });

describe('placePalette', () => {
  it('takes the width of a wide toolbar and sits above it', () => {
    expect(placePalette(toolbar(300, 700), frame(1200))).toEqual({ width: 700, left: 200, bottom: 88, reserved: 88 });
  });

  it('stays at most PALETTE_MAX_WIDTH wide above a long toolbar, centred on it', () => {
    const position = placePalette(toolbar(150, 1100), frame(1400));
    expect(position.width).toBe(PALETTE_MAX_WIDTH);
    expect(position.left).toBe(150 - 100 + (1100 - PALETTE_MAX_WIDTH) / 2);
  });

  it('stays at least PALETTE_MIN_WIDTH wide above a narrow toolbar, centred on it', () => {
    const position = placePalette(toolbar(600, 200), frame(1200));
    expect(position.width).toBe(PALETTE_MIN_WIDTH);
    expect(position.left).toBe(600 - 100 + (200 - PALETTE_MIN_WIDTH) / 2);
  });

  it('keeps clear of the view sides when centring would cross them', () => {
    expect(placePalette(toolbar(110, 200), frame(1200)).left).toBe(16);
    expect(placePalette(toolbar(1050, 200), frame(1200)).left).toBe(1200 - 16 - PALETTE_MIN_WIDTH);
  });

  it('stands near the view\'s lower edge where the toolbar is hidden away, as wide as above it', () => {
    expect(placePalette(toolbar(300, 700), frame(1200), true)).toEqual({ width: 700, left: 200, bottom: PALETTE_VIEW_MARGIN, reserved: PALETTE_VIEW_MARGIN });
  });

  it('never gets wider than the view', () => {
    expect(placePalette(toolbar(120, 300), frame(400))).toMatchObject({ width: 368, left: 16 });
  });
});

describe('placePaletteAtTop', () => {
  // A landscape tablet's view, 1180 × 700 below Obsidian's 56 px header
  const view = { top: 56, bottom: 756 };
  const above = placePalette({ left: 240, top: 690, width: 700, bottom: 746 }, { left: 0, top: 56, width: 1180, bottom: 756 });

  it('hangs the palette from the top of the view, where it stood sideways', () => {
    expect(placePaletteAtTop(above, view, 756)).toEqual({ ...above, top: PALETTE_VIEW_MARGIN, reserved: PALETTE_VIEW_MARGIN });
  });

  it('ends its height above a keyboard that covers the view\'s lower part', () => {
    // The window shows down to 380: 376 px of the view lie under the keyboard
    expect(placePaletteAtTop(above, view, 380).reserved).toBe(PALETTE_VIEW_MARGIN + 376);
  });

  it('counts nothing as covered where the view itself shrank for the keyboard', () => {
    expect(placePaletteAtTop(above, { top: 56, bottom: 380 }, 380).reserved).toBe(PALETTE_VIEW_MARGIN);
  });

  it('never counts more than the view as covered', () => {
    expect(placePaletteAtTop(above, view, 0).reserved).toBe(PALETTE_VIEW_MARGIN + 700);
  });
});
