import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { cancelledMessage } from '../../src/app/packages/components/toolbar/editor/toolbarAnnouncements';
import { barDragPreview, trayShows, WELL } from '../../src/app/packages/components/toolbar/editor/toolbarDragPreview';
import type { ToolbarDrag } from '../../src/app/packages/components/toolbar/editor/toolbarEditStore';
import { useBarWells } from '../../src/app/packages/components/toolbar/editor/useBarWells';
import type { ToolbarControlId } from '../../src/app/toolbar/toolbarCatalog';

const BAR = ['move', 'fog', 'draw', 'text', 'palette'];

function drag(changes: Partial<ToolbarDrag>): ToolbarDrag {
  return { id: 'fog', from: 'bar', zone: 'bar', after: 'move', originAfter: 'move', barWidth: 72, pinned: false, refused: false, ...changes };
}

describe('the bar during a drag', () => {
  it('shows the bar as it is without a drag', () => {
    expect(barDragPreview(BAR, null)).toEqual({ fitIds: BAR, wellAfter: undefined, originHolds: false });
  });

  it('keeps the dragged control\'s own slot as the well over its place and outside both zones, so nothing moves at pickup', () => {
    expect(barDragPreview(BAR, drag({}))).toEqual({ fitIds: BAR, wellAfter: undefined, originHolds: true });
    expect(barDragPreview(BAR, drag({ zone: null, after: 'text' })).originHolds).toBe(true);
    expect(barDragPreview(BAR, drag({ id: 'palette', zone: 'tray', refused: true, originAfter: 'text' })).originHolds).toBe(true);
  });

  it('closes the dragged control\'s slot and opens a well where it would land', () => {
    expect(barDragPreview(BAR, drag({ after: 'text' }))).toEqual({
      fitIds: ['move', 'draw', 'text', WELL, 'palette'], wellAfter: 'text', originHolds: false,
    });
    expect(barDragPreview(BAR, drag({ after: null })).fitIds).toEqual([WELL, 'move', 'draw', 'text', 'palette']);
  });

  it('has no well while the tool is over the tray', () => {
    expect(barDragPreview(BAR, drag({ zone: 'tray' }))).toEqual({
      fitIds: ['move', 'draw', 'text', 'palette'], wellAfter: undefined, originHolds: false,
    });
  });

  it('opens a well for a tool from the tray only over the bar', () => {
    const hidden = ['move', 'draw', 'text', 'palette'];
    expect(barDragPreview(hidden, drag({ from: 'tray', zone: 'tray', after: null, originAfter: null })).fitIds).toEqual(hidden);
    expect(barDragPreview(hidden, drag({ from: 'tray', after: 'draw', originAfter: null })).fitIds).toEqual(['move', 'draw', WELL, 'text', 'palette']);
  });
});

describe('the tray during a drag', () => {
  it('opens the dragged tool\'s slot as the well over the tray, never for the refused Command palette', () => {
    expect(trayShows('fog', false, drag({ zone: 'tray' }))).toBe(true);
    expect(trayShows('fog', false, drag({ zone: 'bar' }))).toBe(false);
    expect(trayShows('palette', false, drag({ id: 'palette', zone: 'tray', refused: true }))).toBe(false);
    expect(trayShows('loot', true, drag({ zone: 'tray' }))).toBe(true);
  });

  it('keeps a tool from the tray in its slot until it is over the bar', () => {
    const fromTray = drag({ from: 'tray', zone: 'tray' });
    expect(trayShows('fog', true, fromTray)).toBe(true);
    expect(trayShows('fog', true, { ...fromTray, zone: null })).toBe(true);
    expect(trayShows('fog', true, { ...fromTray, zone: 'bar' })).toBe(false);
  });
});

describe('the bar\'s wells', () => {
  it('closes the well it leaves while it opens the next, and drops every well at once on a drop', () => {
    const { result, rerender } = renderHook(
      ({ target, instant }: { target: ToolbarControlId | null | undefined; instant: boolean }) => useBarWells(target, instant),
      { initialProps: { target: undefined as ToolbarControlId | null | undefined, instant: false } },
    );
    expect(result.current.wells).toEqual([]);
    rerender({ target: 'move', instant: false });
    expect(result.current.wells).toEqual([{ key: 0, after: 'move', closing: false }]);
    rerender({ target: null, instant: false });
    expect(result.current.wells).toEqual([{ key: 0, after: 'move', closing: true }, { key: 1, after: null, closing: false }]);
    act(() => result.current.closed(0));
    expect(result.current.wells).toEqual([{ key: 1, after: null, closing: false }]);
    rerender({ target: 'text', instant: false });
    rerender({ target: undefined, instant: true });
    expect(result.current.wells).toEqual([]);
  });
});

describe('what the live region says about a drag that was let go', () => {
  it('says where the tool is back', () => {
    expect(cancelledMessage('Fog of war', 2)).toBe('Move cancelled. Fog of war is back at position 2.');
    expect(cancelledMessage('Loot roller', null)).toBe('Move cancelled. Loot roller is back in hidden tools.');
  });
});
