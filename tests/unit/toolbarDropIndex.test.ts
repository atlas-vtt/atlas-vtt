import { describe, expect, it } from 'vitest';
import { dropIndex, dropThresholds, leftNeighbour, zoneAt, ZONE_MARGIN, type FrozenZones } from '../../src/app/packages/components/toolbar/editor/toolbarDropIndex';
import { DEFAULT_TOOLBAR_ORDER, type ToolbarControlId } from '../../src/app/toolbar/toolbarCatalog';
import { resolveToolbarLayout, withControlAfter } from '../../src/app/toolbar/toolbarLayout';

// A bar 400 px wide at the bottom, the tray 8 px above it.
const ZONES: FrozenZones = {
  bar: { left: 100, right: 500, top: 700, bottom: 760 },
  tray: { left: 200, right: 400, top: 650, bottom: 692 },
};

describe('the zone under the pointer', () => {
  it('reaches the margin beyond each zone', () => {
    expect(zoneAt(ZONES, 100 - ZONE_MARGIN, 730)).toBe('bar');
    expect(zoneAt(ZONES, 100 - ZONE_MARGIN - 1, 730)).toBeNull();
    expect(zoneAt(ZONES, 500 + ZONE_MARGIN, 730)).toBe('bar');
    expect(zoneAt(ZONES, 200 - ZONE_MARGIN, 670)).toBe('tray');
    expect(zoneAt(ZONES, 400 + ZONE_MARGIN + 1, 670)).toBeNull();
    expect(zoneAt(ZONES, 300, 650 - ZONE_MARGIN)).toBe('tray');
    expect(zoneAt(ZONES, 300, 650 - ZONE_MARGIN - 1)).toBeNull();
    // Below the bar, towards the window's edge.
    expect(zoneAt(ZONES, 300, 760 + ZONE_MARGIN)).toBe('bar');
  });

  it('widens the bar\'s zone on each side by its own growth (the undo/redo bar\'s place on its left)', () => {
    const growth = { left: 100, right: 0 };
    expect(zoneAt(ZONES, 100 - ZONE_MARGIN - 100, 730, growth)).toBe('bar');
    expect(zoneAt(ZONES, 100 - ZONE_MARGIN - 101, 730, growth)).toBeNull();
    expect(zoneAt(ZONES, 500 + ZONE_MARGIN + 1, 730, growth)).toBeNull();
    expect(zoneAt(ZONES, 500 + ZONE_MARGIN + 10, 730, 10)).toBe('bar');
  });

  it('splits the gap between the tray and the bar at its midline', () => {
    expect(zoneAt(ZONES, 300, 695)).toBe('tray');
    expect(zoneAt(ZONES, 300, 696)).toBe('bar');
    expect(zoneAt(ZONES, 300, 697)).toBe('bar');
    // Above the midline but beside the tray is neither.
    expect(zoneAt(ZONES, 120, 690)).toBeNull();
  });

  it('widens the bar for a tool dragged from the tray', () => {
    expect(zoneAt(ZONES, 100 - ZONE_MARGIN - 40, 730)).toBeNull();
    expect(zoneAt(ZONES, 100 - ZONE_MARGIN - 40, 730, 48)).toBe('bar');
    expect(zoneAt(ZONES, 500 + ZONE_MARGIN + 48, 730, 48)).toBe('bar');
  });

  it('works without a tray', () => {
    expect(zoneAt({ bar: ZONES.bar, tray: null }, 300, 700 - ZONE_MARGIN)).toBe('bar');
    expect(zoneAt({ bar: ZONES.bar, tray: null }, 300, 600)).toBeNull();
  });
});

describe('the slot a drop lands in', () => {
  // Three controls of 40 px and one of 72, 8 px apart; the dragged tool is 40 px wide.
  const widths = [40, 72, 40, 40];
  const thresholds = dropThresholds(100, widths, 8, 40);

  it('puts each threshold midway between the well just before a control and just after it', () => {
    // Before the first: the well's centre at 120; after it: 100 + 40 + 8 + 20 = 168.
    expect(thresholds[0]).toBe(144);
    expect(thresholds).toEqual([144, 208, 272, 320]);
  });

  it('counts the thresholds left of the ghost, growing with x and never flipping back', () => {
    let previous = 0;
    for (let x = 80; x <= 360; x += 0.5) {
      const index = dropIndex(thresholds, x);
      expect(index).toBeGreaterThanOrEqual(previous);
      previous = index;
    }
    expect(dropIndex(thresholds, 143.9)).toBe(0);
    expect(dropIndex(thresholds, 144.1)).toBe(1);
    expect(dropIndex(thresholds, 400)).toBe(4);
    // Back and forth across a threshold gives the same two answers, whatever came before.
    expect([207.9, 208.1, 207.9, 208.1].map(x => dropIndex(thresholds, x))).toEqual([1, 2, 1, 2]);
  });

  it('shifts every threshold with the bar when a tool comes from the tray', () => {
    // The bar is centred, so the well it gains for the tool widens it by W + g on both sides alike.
    const fromTray = dropThresholds(100 - (40 + 8) / 2, widths, 8, 40);
    expect(fromTray).toEqual(thresholds.map(threshold => threshold - 24));
  });

  it('lands after the shown control left of the slot, so controls not shown here keep their places', () => {
    // Lighting is not offered (its switch is off) and Note pin is in "More tools".
    const shown: ToolbarControlId[] = ['move', 'fog', 'draw', 'text', 'measure', 'dice', 'palette'];
    expect(leftNeighbour(shown, 0)).toBeNull();
    expect(leftNeighbour(shown, 5)).toBe('measure');
    expect(leftNeighbour(shown, 99)).toBe('palette');
    const layout = withControlAfter(resolveToolbarLayout({}), 'assets', leftNeighbour(shown, 5));
    expect(layout.order).toEqual(['move', 'fog', 'draw', 'text', 'measure', 'assets', 'wall', 'pin', 'audio', 'dice', 'loot', 'palette']);
    expect(layout.order.length).toBe(DEFAULT_TOOLBAR_ORDER.length);
  });
});
