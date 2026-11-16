import { describe, expect, it } from 'vitest';
import { PALETTE_MAX_WIDTH, PALETTE_MIN_WIDTH, placePalette } from '../../src/app/react/components/command-palette/palettePlacement';

const frame = (width: number) => ({ left: 100, top: 0, width, bottom: 700 });
const toolbar = (left: number, width: number) => ({ left, top: 620, width, bottom: 678 });

describe('placePalette', () => {
  it('takes the width of a wide toolbar and sits above it', () => {
    expect(placePalette(toolbar(300, 700), frame(1200))).toEqual({ width: 700, left: 200, bottom: 88 });
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

  it('never gets wider than the view', () => {
    expect(placePalette(toolbar(120, 300), frame(400))).toMatchObject({ width: 368, left: 16 });
  });
});
