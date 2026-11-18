import { describe, expect, it } from 'vitest';
import { BAR_GAP, BAR_MARGIN, placeSelectionBar, type BarPlaceInput } from '../../../src/app/packages/components/toolbar/selectionBarPlacement';
import { barOffered, type BarOfferState } from '../../../src/app/packages/components/toolbar/useSelectionActionsShown';

/** A token's highlight 80 px wide on a 1180 × 820 view, scene tabs above and the toolbar below; the bar 300 × 56. */
const input = (more: Partial<BarPlaceInput> = {}): BarPlaceInput => ({
  shown: [{ x: 500, y: 300 }, { x: 580, y: 380 }],
  size: { width: 300, height: 56 },
  area: { width: 1180, height: 820 },
  inset: { top: 40, bottom: 70 },
  current: null,
  prefer: 'above',
  ...more,
});

describe('where the bar above a selection stands', () => {
  it('stands centred above what the selection shows, by the gap, and grows out of the middle of its bottom edge', () => {
    expect(placeSelectionBar(input())).toEqual({ x: 540 - 150, y: 300 - BAR_GAP - 56, side: 'above', origin: { x: 150, y: 56 } });
  });

  it('flips below where there is no room above, and grows out of its top edge', () => {
    const place = placeSelectionBar(input({ shown: [{ x: 500, y: 60 }, { x: 580, y: 140 }] }));
    expect(place.side).toBe('below');
    expect(place.y).toBe(140 + BAR_GAP);
    expect(place.origin.y).toBe(0);
  });

  it('keeps the side it took while that side holds', () => {
    const near = input({ shown: [{ x: 500, y: 200 }, { x: 580, y: 280 }] });
    expect(placeSelectionBar({ ...near, current: 'below' }).side).toBe('below');
    expect(placeSelectionBar({ ...near, current: 'above' }).side).toBe('above');
    expect(placeSelectionBar(near).side).toBe('above');
  });

  it('stays inside the view, clear of the scene tabs and the toolbar, over a selection that leaves no room', () => {
    const left = placeSelectionBar(input({ shown: [{ x: -60, y: 300 }, { x: 20, y: 380 }] }));
    expect(left.x).toBe(BAR_MARGIN);
    const right = placeSelectionBar(input({ shown: [{ x: 1150, y: 300 }, { x: 1230, y: 380 }] }));
    expect(right.x).toBe(1180 - BAR_MARGIN - 300);
    const tall = placeSelectionBar(input({ shown: [{ x: 500, y: -400 }, { x: 580, y: 1400 }] }));
    expect(tall.y).toBeGreaterThanOrEqual(40 + BAR_MARGIN);
    expect(tall.y + 56).toBeLessThanOrEqual(820 - 70 - BAR_MARGIN);
  });

  it('keeps beside a panel at the map\'s side where it stands level with it, and passes over one it does not', () => {
    const switcher = { left: 8, top: 200, right: 120, bottom: 600 };
    const tracker = { left: 1000, top: 200, right: 1168, bottom: 600 };
    const beside = placeSelectionBar(input({ shown: [{ x: 20, y: 300 }, { x: 100, y: 380 }], sides: [switcher, tracker] }));
    expect(beside.x).toBe(120 + BAR_MARGIN);
    const other = placeSelectionBar(input({ shown: [{ x: 1100, y: 300 }, { x: 1170, y: 380 }], sides: [switcher, tracker] }));
    expect(other.x).toBe(1000 - BAR_MARGIN - 300);
    // Above the panels the whole width is the bar's
    const clear = placeSelectionBar(input({ shown: [{ x: 20, y: 120 }, { x: 100, y: 190 }], sides: [switcher, tracker] }));
    expect(clear.x).toBe(BAR_MARGIN);
  });

  it('centres only its part before the tail, so Done joining at its end moves no button', () => {
    const without = placeSelectionBar(input());
    const withTail = placeSelectionBar(input({ size: { width: 360, height: 56 }, centred: 300 }));
    expect(withTail.x).toBe(without.x);
  });

  it('stands beyond the other bar of the selection where that one took its side', () => {
    // The bar under drawings stands above them (no room below): its box is part of what this one keeps clear of.
    const other = [{ x: 380, y: 240 }, { x: 700, y: 288 }];
    const place = placeSelectionBar(input({ shown: [{ x: 500, y: 300 }, { x: 580, y: 380 }, ...other] }));
    expect(place.side).toBe('above');
    expect(place.y).toBe(240 - BAR_GAP - 56);
  });
});

describe('when the view offers the bar a place', () => {
  const state = (more: Partial<BarOfferState> = {}): BarOfferState => ({
    selectedIds: ['token'], activeTool: 'move', isGMView: true, isPlayerView: false, isToolbarEditing: false, isMapLoading: false, ...more,
  });

  it('does with something selected in the GM\'s view, with the move or the select tool', () => {
    expect(barOffered(state(), true)).toBe(true);
    expect(barOffered(state({ activeTool: 'select' }), true)).toBe(true);
  });

  it('does not on a device that does not show it: a mouse without the setting', () => {
    expect(barOffered(state(), false)).toBe(false);
  });

  it('does not with nothing selected, another tool, the players\' view, the session view, a loading map or the toolbar being arranged', () => {
    expect(barOffered(state({ selectedIds: [] }), true)).toBe(false);
    expect(barOffered(state({ activeTool: 'draw' }), true)).toBe(false);
    expect(barOffered(state({ activeTool: 'laser-pointer' }), true)).toBe(false);
    expect(barOffered(state({ isPlayerView: true }), true)).toBe(false);
    expect(barOffered(state({ isGMView: false }), true)).toBe(false);
    expect(barOffered(state({ isMapLoading: true }), true)).toBe(false);
    expect(barOffered(state({ isToolbarEditing: true }), true)).toBe(false);
  });
});
