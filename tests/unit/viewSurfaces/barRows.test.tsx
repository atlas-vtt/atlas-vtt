// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Each bar says whether it shows to the shared bars; what they hold is tested beside each bar.
vi.mock('../../../src/app/packages/components/toolbar/ToolOptionsBar', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../../src/app/packages/components/toolbar/ToolOptionsBar')>(),
  ToolOptionsBars: ({ shown }: { shown: boolean }) => <div data-testid="bar" data-shown={String(shown)} />,
}));

import { DrawToolBar } from '../../../src/app/packages/components/toolbar/DrawToolBar';
import { FogToolBar } from '../../../src/app/packages/components/toolbar/FogToolBar';
import { LightingToolBar } from '../../../src/app/packages/components/toolbar/LightingToolBar';
import { MeasureToolBar } from '../../../src/app/packages/components/toolbar/MeasureToolBar';
import { SelectionBarHost } from '../../../src/app/packages/components/toolbar/SelectionBar';
import { FloorPositionBar } from '../../../src/app/react/components/levels/FloorPositionBar';
import { AtlasUIContext, type AtlasUIContextValue } from '../../../src/app/react/root/AtlasUIContext';
import { ViewStoreProvider } from '../../../src/app/react/ViewStoreContext';
import type { ViewAtlasState, ViewAtlasStore } from '../../../src/app/storeFactory';
import { surfaceView } from './surfaceView';

afterEach(cleanup);

interface Bar {
  element: React.ReactElement;
  /** What brings the bar up in the GM's view. */
  bringUp: (state: ViewAtlasState) => void;
}

const BARS: Readonly<Record<string, Bar>> = {
  fog: { element: <FogToolBar />, bringUp: (s) => s.setActiveTool('fog') },
  eraser: { element: <FogToolBar />, bringUp: (s) => s.setActiveTool('eraser') },
  lighting: { element: <LightingToolBar />, bringUp: (s) => s.setActiveTool('wall') },
  draw: { element: <DrawToolBar />, bringUp: (s) => s.setActiveTool('draw') },
  measure: { element: <MeasureToolBar playerView={false} />, bringUp: (s) => s.setActiveTool('measure') },
  floorPosition: { element: <FloorPositionBar />, bringUp: (s) => s.setFloorPositioning(true) },
};

const STATES = {
  gmView: (): void => undefined,
  toolbarEditing: (store: ViewAtlasStore): void => store.getState().setToolbarEditing(true),
  mapLoading: (store: ViewAtlasStore): void => store.getState().setMapLoading(true),
  playerView: (store: ViewAtlasStore): void => store.setState({ isPlayerView: true }),
  sessionView: (store: ViewAtlasStore): void => store.getState().setGMView(false),
  tableMode: (store: ViewAtlasStore): void => store.getState().enterTableMode(),
  measureKeyHeld: (store: ViewAtlasStore): void => store.getState().holdRuler(),
} as const;

type StateName = keyof typeof STATES;

/** Where each bar shows. */
const SHOWN_IN: Readonly<Record<keyof typeof BARS, readonly StateName[]>> = {
  fog: ['gmView', 'sessionView', 'measureKeyHeld'],
  eraser: ['gmView', 'sessionView', 'measureKeyHeld'],
  lighting: ['gmView', 'sessionView', 'measureKeyHeld'],
  draw: ['gmView', 'sessionView', 'measureKeyHeld'],
  measure: ['gmView', 'playerView', 'sessionView'],
  floorPosition: ['gmView', 'sessionView', 'measureKeyHeld'],
};

const CASES = Object.keys(BARS).flatMap((bar) => (Object.keys(STATES) as StateName[]).map((state) => [bar, state] as const));

describe('where each bar shows', () => {
  it.each(CASES)('%s, in %s', async (bar, state) => {
    const { store } = surfaceView();
    BARS[bar]!.bringUp(store.getState());
    render(<ViewStoreProvider store={store}>{BARS[bar]!.element}</ViewStoreProvider>);
    await act(async () => { STATES[state](store); });
    expect(screen.getByTestId('bar').dataset.shown).toBe(String(SHOWN_IN[bar]!.includes(state)));
  });
});

/** Where the bar under a selected drawing or text shows, while the canvas shows such a selection's frame. */
const DRAWING_SELECTION_SHOWN_IN: readonly StateName[] = ['gmView', 'measureKeyHeld'];

describe('where the bar under a selected drawing shows', () => {
  it.each(Object.keys(STATES) as StateName[])('in %s', async (state) => {
    const { store, app } = surfaceView();
    STATES[state](store);
    const frame = { x: 0, y: 0, width: 40, height: 40, rotation: 0 };
    const renderer = { getAnnotations: () => ({ barFrame: () => frame }), getViewportInstance: () => undefined, getCanvasElement: () => undefined };
    const ui = { app, view: null, pixiApp: null, renderer } as unknown as AtlasUIContextValue;
    await act(async () => {
      render(<AtlasUIContext.Provider value={ui}><ViewStoreProvider store={store}><SelectionBarHost /></ViewStoreProvider></AtlasUIContext.Provider>);
    });
    expect(screen.queryByRole('toolbar') !== null).toBe(DRAWING_SELECTION_SHOWN_IN.includes(state));
  });
});
