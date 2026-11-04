import { describe, expect, it } from 'vitest';
import { columnsOf, gutterOf, HANDLE_SIZE, placeHandle } from '../../../../src/app/statblocks/editor/interaction/handleGeometry';

const box = (left: number, top: number, right: number, bottom: number) => ({ left, top, right, bottom });

/** A card from x 0 with 16 px padding: columns at 16–316 and 332–632, 16 px apart. */
const columns = columnsOf([box(16, 0, 316, 100), box(16, 110, 316, 300), box(332, 0, 632, 200)]);

describe('where a handle stands (spec §3.3)', () => {
  it('reads the card\'s columns from its top-level blocks', () => {
    expect(columns).toEqual([{ left: 16, right: 316 }, { left: 332, right: 632 }]);
    expect(gutterOf(columns, 0, 0)).toEqual({ left: 0, right: 16 });
    expect(gutterOf(columns, 1, 0)).toEqual({ left: 316, right: 332 });
  });

  it('centres the handle in its column\'s gutter, on the target\'s first line', () => {
    expect(placeHandle(box(16, 40, 316, 80), { top: 40, bottom: 60 }, columns, 0)).toEqual({ x: 8, y: 50, orientation: 'vertical' });
    expect(placeHandle(box(332, 10, 632, 30), { top: 10, bottom: 30 }, columns, 0)).toEqual({ x: 324, y: 20, orientation: 'vertical' });
  });

  it('keeps a nested block or an ability in its column\'s gutter: sections do not indent', () => {
    expect(placeHandle(box(16.5, 120, 316, 140), { top: 120, bottom: 140 }, columns, 0).x).toBe(8);
  });

  it('turns the handle and hangs it above a block with no gutter (a later child of Side by side)', () => {
    expect(placeHandle(box(170, 60, 316, 90), { top: 60, bottom: 80 }, columns, 0)).toEqual({
      x: 170 + HANDLE_SIZE / 2, y: 60 - HANDLE_SIZE / 2, orientation: 'horizontal',
    });
  });

  it('never hangs a turned handle above the card: a picture at the card\'s top keeps it in the padding', () => {
    const placed = placeHandle(box(170, 16, 316, 90), { top: 16, bottom: 36 }, columns, 0, 0);
    expect(placed.orientation).toBe('horizontal');
    expect(placed.y - HANDLE_SIZE / 2).toBeGreaterThanOrEqual(-4);
  });
});
