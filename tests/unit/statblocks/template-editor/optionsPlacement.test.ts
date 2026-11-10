import { describe, expect, it } from 'vitest';
import {
  OPTIONS_GAP, OPTIONS_MARGIN, placeClearOf, placeOptions, type OptionsRoom,
} from '../../../../src/app/statblocks/editor/template-editor/options/optionsPlacement';

const box = (left: number, top: number, right: number, bottom: number): OptionsRoom['tile'] => ({ left, top, right, bottom });

/** An editor 1280 × 800: the note's column to 640, the dock beside the card, a tile and its toolbar on the card. */
function room(change: Partial<OptionsRoom> = {}): OptionsRoom {
  return {
    view: box(0, 0, 1280, 800),
    card: box(640, 0, 1280, 800),
    dock: box(589, 270, 632, 530),
    tile: box(660, 300, 1260, 320),
    toolbar: box(1040, 332, 1260, 368),
    ...change,
  };
}

const SIZE = { width: 320, height: 240 };

describe('where a tile\'s Options stand', () => {
  it('stands beside the card, clear of the dock, at the height of its tile', () => {
    const placed = placeOptions(room(), SIZE);
    expect(placed).toEqual({ left: 589 - OPTIONS_GAP - 320, top: 300, maxHeight: null, side: 'beside' });
  });

  it('slides up for a tile near the view\'s foot, whole and without scrolling', () => {
    const placed = placeOptions(room({ tile: box(660, 760, 1260, 780), toolbar: box(1040, 724, 1260, 760) }), SIZE);
    expect(placed.side).toBe('beside');
    expect(placed.top + SIZE.height).toBe(800 - OPTIONS_MARGIN);
    expect(placed.maxHeight).toBeNull();
  });

  it('never starts above the view for a tile scrolled out at the top', () => {
    expect(placeOptions(room({ tile: box(660, -40, 1260, -20), toolbar: null }), SIZE).top).toBe(OPTIONS_MARGIN);
  });

  it('scrolls only where it is taller than the view, then over the view\'s whole height', () => {
    const fits = placeOptions(room(), { width: 320, height: 800 - 2 * OPTIONS_MARGIN });
    expect([fits.top, fits.maxHeight]).toEqual([OPTIONS_MARGIN, null]);
    const tall = placeOptions(room(), { width: 320, height: 900 });
    expect([tall.top, tall.maxHeight, tall.side]).toEqual([OPTIONS_MARGIN, 800 - 2 * OPTIONS_MARGIN, 'beside']);
  });

  it('stands over the dock where the note\'s column has no room beside it, and still left of the card', () => {
    const narrow = room({ view: box(0, 0, 720, 800), card: box(360, 0, 720, 800), dock: box(309, 270, 352, 530), tile: box(380, 300, 700, 320), toolbar: null });
    const placed = placeOptions(narrow, SIZE);
    expect(placed.side).toBe('beside');
    expect(placed.left + SIZE.width).toBe(360 - OPTIONS_GAP);
    expect(placed.left).toBeGreaterThanOrEqual(OPTIONS_MARGIN);
  });

  it('goes below the tile and its toolbar where the card stands above the note, inside the view\'s sides', () => {
    const stacked = room({ view: box(0, 0, 600, 800), card: box(0, 0, 600, 420), dock: null, tile: box(300, 100, 580, 120), toolbar: box(360, 132, 580, 168) });
    const placed = placeOptions(stacked, SIZE);
    expect(placed).toEqual({ left: 600 - OPTIONS_MARGIN - 320, top: 168 + OPTIONS_GAP, maxHeight: null, side: 'below' });
  });

  it('goes above them where only that side holds it whole, and takes the roomier side where neither does', () => {
    const low = { view: box(0, 0, 600, 800), card: box(0, 0, 600, 800), dock: null, tile: box(20, 700, 580, 720), toolbar: box(360, 732, 580, 768) };
    const above = placeOptions(room(low), SIZE);
    expect([above.side, above.top, above.maxHeight]).toEqual(['above', 700 - OPTIONS_GAP - 240, null]);

    const middle = { ...low, tile: box(20, 380, 580, 400), toolbar: box(360, 412, 580, 448) };
    const capped = placeOptions(room(middle), { width: 320, height: 700 });
    expect(capped.side).toBe('above');
    expect(capped.maxHeight).toBe(380 - OPTIONS_GAP - OPTIONS_MARGIN);
    expect(capped.top).toBe(OPTIONS_MARGIN);
  });
});

describe('where a popover clear of a tile stands (a new tile\'s Name)', () => {
  const view = box(0, 0, 600, 800);
  const size = { width: 240, height: 48 };

  it('stands under the tile on its left edge, the gap below it', () => {
    expect(placeClearOf(box(40, 100, 560, 130), view, size, 12)).toEqual({ left: 40, top: 142, maxHeight: null, side: 'below' });
  });

  it('stands above a tile near the view\'s foot, never over it', () => {
    const placed = placeClearOf(box(40, 740, 560, 770), view, size, 12);
    expect(placed.side).toBe('above');
    expect(placed.top + size.height).toBe(740 - 12);
  });

  it('keeps inside the view at its right edge', () => {
    expect(placeClearOf(box(500, 100, 590, 130), view, size, 12).left).toBe(600 - OPTIONS_MARGIN - 240);
  });
});
