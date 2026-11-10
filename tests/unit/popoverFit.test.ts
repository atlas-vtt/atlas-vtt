import { describe, expect, it } from 'vitest';
import { POPOVER_FITS, fitPopover, LIST_FITS, fitList } from '../../src/app/packages/components/primitives/popoverFit';

const FRAME = { left: 0, top: 0, right: 800, bottom: 600 };
const box = (left: number, width: number, top: number, height: number, contentHeight = height) =>
  ({ left, right: left + width, top, bottom: top + height, contentHeight });

describe('fitPopover', () => {
  it('leaves a popover alone when it fits', () => {
    expect(fitPopover(box(100, 220, 200, 300), FRAME, 'top')).toBe(POPOVER_FITS);
  });

  it('shifts a popover back from the right edge', () => {
    expect(fitPopover(box(650, 220, 200, 300), FRAME, 'top').shiftX).toBe(800 - 8 - 870);
  });

  it('shifts a popover back from the left edge', () => {
    expect(fitPopover(box(-30, 220, 200, 300), FRAME, 'top').shiftX).toBe(38);
  });

  it('keeps the left edge in a view narrower than the popover', () => {
    const narrow = { left: 0, top: 0, right: 200, bottom: 600 };
    expect(fitPopover(box(50, 220, 200, 300), narrow, 'top').shiftX).toBe(-42);
  });

  it('caps a popover that opens upwards to the room above its anchor', () => {
    // Anchored with its bottom at 400: 392px of room below the 8px margin.
    expect(fitPopover(box(100, 220, -100, 500), FRAME, 'top').maxHeight).toBe(392);
  });

  it('caps a popover that opens downwards to the room below its anchor', () => {
    expect(fitPopover(box(100, 220, 300, 400), FRAME, 'bottom').maxHeight).toBe(292);
  });

  it('keeps the cap while the capped content is still too tall', () => {
    // Capped at 392px last time, but its content is 500px tall.
    expect(fitPopover(box(100, 220, 8, 392, 500), FRAME, 'top').maxHeight).toBe(392);
  });
});

describe('fitList', () => {
  const frame = { left: 0, top: 0, right: 800, bottom: 600 }
  const GAP = 4

  it('opens below its trigger where the list fits there', () => {
    expect(fitList({ top: 100, bottom: 130 }, 240, frame, GAP)).toBe(LIST_FITS)
  })

  it('opens above where below is too short and above is roomier, whole where it fits there', () => {
    expect(fitList({ top: 500, bottom: 530 }, 240, frame, GAP)).toEqual({ up: true, maxHeight: null })
  })

  it('stays below, shortened to the room, where above is no roomier', () => {
    expect(fitList({ top: 100, bottom: 130 }, 600, frame, GAP)).toEqual({ up: false, maxHeight: 600 - 8 - 130 - GAP })
  })

  it('is shortened above too, where neither side holds it', () => {
    expect(fitList({ top: 400, bottom: 430 }, 600, frame, GAP)).toEqual({ up: true, maxHeight: 400 - GAP - 8 })
  })
})
