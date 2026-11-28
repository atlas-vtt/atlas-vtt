// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { MotionGlobalConfig } from 'framer-motion';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { FloorPositionBar } from '../../../src/app/react/components/levels/FloorPositionBar';
import { startFloorPositioning } from '../../../src/app/react/components/levels/levelEditing';
import { AtlasUIContext, type AtlasUIContextValue } from '../../../src/app/react/root/AtlasUIContext';
import { ViewStoreProvider } from '../../../src/app/react/ViewStoreContext';
import { createViewAtlasStore, type ViewAtlasStore } from '../../../src/app/storeFactory';
import { getHistoryStore } from '../../../src/app/stores/history';
import type { SceneLevel } from '../../../src/app/types/sceneLevelTypes';
import { createInMemoryApp } from '../../mocks/inMemoryVault';

beforeAll(() => { MotionGlobalConfig.skipAnimations = true; });
afterAll(() => { MotionGlobalConfig.skipAnimations = false; });
afterEach(cleanup);

const level = (id: string): SceneLevel => ({ id, name: id, elevation: { bottom: 0, top: 10 }, background: null });

/** The GM's view of a loaded scene of two floors on a square grid, showing the ground floor. */
function twoFloors(): { store: ViewAtlasStore; app: AtlasUIContextValue['app'] } {
  const { app } = createInMemoryApp();
  const store = createViewAtlasStore(app, `floor-table-${Math.random()}`);
  store.setState({
    persistenceEnabled: false, mapLoaded: true, isMapLoading: false, isGMView: true,
    levels: [level('ground'), level('upper')], viewedLevel: 'ground',
    grid: { enabled: true, size: 70, offsetX: 0, offsetY: 0, opacity: 0.5, type: 'square' },
  });
  getHistoryStore(store)?.getState().clear();
  return { store, app };
}

/** What the map shows of Position floor: the other floor's ghost, and the canvas the presses land on. */
interface MapDouble {
  canvas: HTMLCanvasElement;
  ghost: string | null;
  renderer: AtlasUIContextValue['renderer'];
}

function mapDouble(): MapDouble {
  document.body.empty();
  const canvas = document.body.createDiv({ cls: 'workspace-leaf mod-active' }).createDiv({ attr: { 'data-view-id': 'table-view' } }).createDiv().createEl('canvas');
  const map: MapDouble = { canvas, ghost: null, renderer: null };
  map.renderer = {
    showFloorGhost: (levelId: string | null) => { map.ghost = levelId; },
    getCanvasElement: () => canvas,
    getViewportInstance: () => ({ scale: { x: 1 } }),
    previewViewedPlacement: () => undefined,
  } as unknown as AtlasUIContextValue['renderer'];
  return map;
}

function pointer(target: EventTarget, type: string, clientX: number): void {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX, clientY: 0, button: 0 });
  Object.defineProperty(event, 'pointerId', { value: 1 });
  target.dispatchEvent(event);
}

describe('Position floor when Table mode begins', () => {
  it('ends: the other floor\'s ghost leaves the map, and a drag on the table moves no floor', async () => {
    const { store, app } = twoFloors();
    const map = mapDouble();
    const ui = { app, view: { viewId: 'table-view' }, pixiApp: null, renderer: map.renderer } as unknown as AtlasUIContextValue;
    render(<AtlasUIContext.Provider value={ui}><ViewStoreProvider store={store}><FloorPositionBar /></ViewStoreProvider></AtlasUIContext.Provider>);

    await act(async () => { startFloorPositioning(store, 'upper'); });
    expect(map.ghost).toBe('ground');

    await act(async () => { store.getState().enterTableMode(); });
    expect(store.getState().isFloorPositioning).toBe(false);
    await waitFor(() => expect(map.ghost).toBeNull());

    const steps = store.temporal.getState().pastStates.length;
    pointer(map.canvas, 'pointerdown', 0);
    pointer(window, 'pointermove', 210);
    pointer(window, 'pointerup', 210);
    expect(store.getState().levelAlignments?.upper).toBeUndefined();
    expect(store.temporal.getState().pastStates).toHaveLength(steps);
  });
});
