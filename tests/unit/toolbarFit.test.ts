import { describe, expect, it } from 'vitest';
import { overflowingToolbarItems, type ToolbarFitItem, type ToolbarFitLayout } from '../../src/app/packages/components/toolbar/toolbarFit';

const item = (id: string, width: number | undefined = 40, pinned = false): ToolbarFitItem => ({ id, width, pinned });

// 8px padding + 1px border on each side, 8px gaps, a 40px overflow button.
const layout = (available: number): ToolbarFitLayout => ({ available, chrome: 18, gap: 8, overflowButtonWidth: 40 });

const ITEMS = [item('move'), item('fog'), item('draw'), item('measure'), item('palette')];
// All five: 18 + 5 * 40 + 4 * 8 = 250px. With the overflow button every kept item costs 48px.

describe('overflowingToolbarItems', () => {
  it('hides nothing while every item fits', () => {
    expect(overflowingToolbarItems(ITEMS, layout(250)).size).toBe(0);
  });

  it('hides nothing while the width is unconstrained', () => {
    expect(overflowingToolbarItems(ITEMS, layout(Number.POSITIVE_INFINITY)).size).toBe(0);
  });

  it('moves the rightmost items out first and leaves room for the overflow button', () => {
    // 249px: 18 + 40 (button) + 3 * 48 = 202 leaves room for three.
    expect([...overflowingToolbarItems(ITEMS, layout(249))]).toEqual(['measure', 'palette']);
    // One pixel short of three items with the button: two stay.
    expect([...overflowingToolbarItems(ITEMS, layout(201))]).toEqual(['draw', 'measure', 'palette']);
  });

  it('keeps pinned items wherever they are', () => {
    const items = ITEMS.map((entry) => (entry.id === 'draw' ? { ...entry, pinned: true } : entry));
    // Room for two: the pinned draw and the leftmost other item.
    expect([...overflowingToolbarItems(items, layout(154))]).toEqual(['fog', 'measure', 'palette']);
  });

  it('keeps a pinned palette at the end while the controls left of it leave', () => {
    const items = ITEMS.map((entry) => (entry.id === 'palette' ? { ...entry, pinned: true } : entry));
    expect([...overflowingToolbarItems(items, layout(202))]).toEqual(['draw', 'measure']);
    expect([...overflowingToolbarItems(items, layout(106))]).toEqual(['move', 'fog', 'draw', 'measure']);
  });

  it('keeps pinned items when they alone are too wide', () => {
    const items = [item('move', 40, true), item('fog', 40, true), item('draw')];
    expect([...overflowingToolbarItems(items, layout(60))]).toEqual(['draw']);
  });

  it('keeps items that have not been measured yet so they can be', () => {
    const items = [item('move'), { id: 'new', width: undefined, pinned: false }, item('draw', 60)];
    expect([...overflowingToolbarItems(items, layout(120))]).toEqual(['draw']);
  });

  it('never keeps a narrower item further right over the first that does not fit', () => {
    const items = [item('wide', 120), item('narrow', 20)];
    // Button + narrow would fit (18 + 40 + 28 = 86), but the bar keeps a run from the left.
    expect([...overflowingToolbarItems(items, layout(100))]).toEqual(['wide', 'narrow']);
  });
});
