import { describe, expect, it } from 'vitest';
import { createViewAtlasStore, type ViewAtlasStore } from '../../../src/app/storeFactory';
import { getHistoryStore } from '../../../src/app/stores/history';
import type { Viewport } from 'pixi-viewport';
import { mapGestureHost } from '../../../src/app/pixi/input/mapGestureHost';
import { createInMemoryApp } from '../../mocks/inMemoryVault';

function store(): ViewAtlasStore {
  return createViewAtlasStore(createInMemoryApp().app, `table-mode-${Math.random()}`);
}

describe('Table mode in the view store', () => {
  it('shows the players\' picture: session view, the move tool, nothing selected, no editor open', () => {
    const view = store();
    view.getState().setActiveTool('fog');
    view.getState().setSelection(['token-1']);
    view.getState().setCommandPaletteOpen(true);
    view.getState().setToolbarEditing(true);
    view.getState().setGridAlignmentOpen(true);

    view.getState().enterTableMode();

    const state = view.getState();
    expect(state.tableMode).toEqual({ activeTool: 'fog', isGMView: true });
    expect(state.isGMView).toBe(false);
    expect(state.activeTool).toBe('move');
    expect(state.selectedIds).toEqual([]);
    expect(state.isCommandPaletteOpen).toBe(false);
    expect(state.isToolbarEditing).toBe(false);
    expect(state.isGridAlignmentOpen).toBe(false);
  });

  it('returns to the GM\'s view as it was: its tool, its GM or session view, and the panels it had open', () => {
    const view = store();
    view.getState().setActiveTool('measure');
    view.getState().setDMScreenOpen(true);
    view.getState().setDiceLogOpen(true);
    view.getState().setInitiativeTrackerOpen(true);

    view.getState().enterTableMode();
    // Panels are hidden by the view, not closed: they are there again afterwards
    expect(view.getState().isDMScreenOpen).toBe(true);
    view.getState().leaveTableMode();

    const state = view.getState();
    expect(state.tableMode).toBeNull();
    expect(state.activeTool).toBe('measure');
    expect(state.isGMView).toBe(true);
    expect(state.isDMScreenOpen).toBe(true);
    expect(state.isDiceLogOpen).toBe(true);
    expect(state.initiativeTrackerOpen).toBe(true);
  });

  it('a GM who was in session view comes back to session view', () => {
    const view = store();
    view.getState().setGMView(false);
    view.getState().enterTableMode();
    view.getState().leaveTableMode();
    expect(view.getState().isGMView).toBe(false);
  });

  it('entering twice keeps what the first entry remembered, and leaving outside it changes nothing', () => {
    const view = store();
    view.getState().setActiveTool('draw');
    view.getState().enterTableMode();
    view.getState().enterTableMode();
    expect(view.getState().tableMode).toEqual({ activeTool: 'draw', isGMView: true });
    view.getState().leaveTableMode();
    view.getState().setActiveTool('fog');
    view.getState().leaveTableMode();
    expect(view.getState().activeTool).toBe('fog');
  });

  it('does not begin while the asset manager covers the map', () => {
    const view = store();
    view.getState().openAssetManager();
    view.getState().enterTableMode();
    expect(view.getState().tableMode).toBeNull();
    expect(view.getState().isGMView).toBe(true);
  });

  it('is no undo step, in or out', () => {
    const view = store();
    view.getState().enterTableMode();
    view.getState().leaveTableMode();
    expect(getHistoryStore(view)?.getState().pastStates ?? []).toEqual([]);
  });
});

describe('fingers on a map in Table mode', () => {
  const host = (view: ViewAtlasStore): ReturnType<typeof mapGestureHost> => mapGestureHost({
    store: view,
    viewport: { toWorld: (x: number, y: number) => ({ x, y }) } as unknown as Viewport,
    placing: () => false,
    marqueePending: () => true,
    menuAt: () => true,
    tapActsAt: () => true,
    fingers: { use: 'tool', notePen: () => undefined },
  });

  it('only look at it, whatever tool the GM left, and get the GM\'s tool back afterwards', () => {
    const view = store();
    view.getState().setActiveTool('fog');
    const gestures = host(view);
    expect(gestures.fingerMode()).toBe('tool');
    view.getState().enterTableMode();
    expect(gestures.fingerMode()).toBe('look');
    gestures.endLooking?.();
    expect(view.getState().tableMode).toBeNull();
    expect(gestures.fingerMode()).toBe('tool');
  });

  it('take no step back or forward: a tap of two or three fingers is the GM\'s undo and redo', () => {
    const view = store();
    view.getState().addWall({ type: 'solid', p1: { x: 0, y: 0 }, p2: { x: 100, y: 0 } });
    const gestures = host(view);
    view.getState().enterTableMode();
    gestures.undo();
    expect(Object.keys(view.getState().objects.walls)).toHaveLength(1);
    view.getState().leaveTableMode();
    gestures.undo();
    expect(Object.keys(view.getState().objects.walls)).toHaveLength(0);
  });
});
