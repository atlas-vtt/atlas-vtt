import { describe, expect, it } from 'vitest';
import { placeBelow, type Box } from '../../../../src/app/statblocks/editor/template-editor/toolbar/toolbarBelow';

const overlaps = (a: Box, b: Box): boolean => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

/** The selected block's toolbar (spec §4.2, D1): 8 px below the outline, above only without room, inside the view. */
describe('placeBelow', () => {
  const view = { left: 0, top: 100, right: 500, bottom: 600 };
  const layer = { left: 0, top: 0, right: 600, bottom: 700 };
  const size = { width: 180, height: 36 };

  it('stands below the block, 8 px past its outline, its right edge on the block\'s', () => {
    expect(placeBelow({ left: 40, top: 300, right: 400, bottom: 340 }, view, layer, size)).toEqual({ left: 220, top: 352, above: false, hidden: false });
  });

  it('starts at the block\'s left edge where the block is narrower than the toolbar', () => {
    expect(placeBelow({ left: 40, top: 300, right: 200, bottom: 340 }, view, layer, size).left).toBe(40);
  });

  it('flips above where the view has no room below, and never covers the block', () => {
    const block = { left: 40, top: 520, right: 200, bottom: 580 };
    const placed = placeBelow(block, view, layer, size);
    expect(placed).toMatchObject({ top: 472, above: true });
    expect(overlaps({ left: placed.left, top: placed.top, right: placed.left + size.width, bottom: placed.top + size.height }, block)).toBe(false);
  });

  it('keeps inside the view sideways, and hides with a block scrolled away', () => {
    expect(placeBelow({ left: 420, top: 300, right: 480, bottom: 320 }, view, layer, size).left).toBe(320);
    expect(placeBelow({ left: 40, top: 700, right: 200, bottom: 740 }, view, layer, size).hidden).toBe(true);
  });

  it('places in the layer\'s coordinates', () => {
    expect(placeBelow({ left: 40, top: 300, right: 200, bottom: 340 }, view, { ...layer, left: 10, top: 20 }, size)).toMatchObject({ left: 30, top: 332 });
  });
});
