import { describe, expect, it } from 'vitest';
import { layeredListStyle, listPassesEnd } from '../../src/app/packages/components/primitives/selectListPlacement';
import { LIST_FITS } from '../../src/app/packages/components/primitives/popoverFit';

const frame = { left: 0, right: 400 };

describe('a select list wider than its trigger', () => {
  it('hangs from the trigger\'s start while the room after it holds the list', () => {
    expect(listPassesEnd({ left: 100, right: 180 }, 200, frame)).toBe(false);
  });

  it('starts from the trigger\'s end where it would pass the view\'s end, as the trigger at a dialog\'s edge', () => {
    expect(listPassesEnd({ left: 300, right: 380 }, 200, frame)).toBe(true);
  });

  it('keeps the start where neither side holds it', () => {
    expect(listPassesEnd({ left: 50, right: 130 }, 500, frame)).toBe(false);
  });

  it('is at least as wide as its trigger in a layer, set from the side it starts from', () => {
    const trigger = { left: 300, top: 10, right: 380, bottom: 40, width: 80 };
    const layer = { left: 0, top: 0, right: 400, bottom: 600 };
    expect(layeredListStyle(trigger, layer, LIST_FITS)).toMatchObject({ left: 300, minWidth: 80 });
    expect(layeredListStyle(trigger, layer, LIST_FITS, 4, true)).toMatchObject({ right: 20, minWidth: 80 });
  });
});
