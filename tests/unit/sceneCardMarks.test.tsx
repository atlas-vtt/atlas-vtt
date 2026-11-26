// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import type { App } from 'obsidian';
import { createStore, type StoreApi } from 'zustand/vanilla';
import { AtlasUIContext, type AtlasUIContextValue } from '../../src/app/react/root/AtlasUIContext';
import { ViewStoreProvider } from '../../src/app/react/ViewStoreContext';
import type { ViewAtlasStore } from '../../src/app/storeFactory';
import { presentedSceneOf } from '../../src/app/services/presentedScene';
import { SceneMarkers, sceneCardName, useSceneMarks } from '../../src/app/packages/components/asset-manager/components/SceneMarkers';
import { TooltipProvider } from '../../src/app/packages/components/primitives/tooltip';

afterEach(cleanup);

const CAVE = 'atlas-vtt/collections/Demo/scenes/Goblin Cave.atlasmap';
const MILL = 'atlas-vtt/collections/Demo/scenes/Old Mill.atlasmap';

function appWithStorage(): App {
  const stored = new Map<string, unknown>();
  return { loadLocalStorage: (key: string) => stored.get(key) ?? null, saveLocalStorage: (key: string, value: unknown) => void stored.set(key, value) } as unknown as App;
}

function Card({ path }: { path: string | undefined }): React.JSX.Element {
  const marks = useSceneMarks(path);
  return (
    <div data-testid={path ?? 'token'} aria-label={sceneCardName('Cave', marks) ?? 'Cave'}>
      <SceneMarkers marks={marks} />
    </div>
  );
}

/** The "Open" mark's word, drawn from its attribute so it stays out of the card's visible text; null without one. */
function openWord(path: string): string | null {
  return screen.getByTestId(path).querySelector('.atlas-asset-scene-marks__open')?.getAttribute('data-label') ?? null;
}

function renderCards(): { app: App; store: StoreApi<{ mapPath: string | null }> } {
  const app = appWithStorage();
  const store = createStore<{ mapPath: string | null }>(() => ({ mapPath: CAVE }));
  const ui = { app, view: null, pixiApp: null, renderer: null } as AtlasUIContextValue;
  render(
    <AtlasUIContext.Provider value={ui}>
      <ViewStoreProvider store={store as unknown as ViewAtlasStore}>
        <TooltipProvider>
          <Card path={CAVE} />
          <Card path={MILL} />
          <Card path={undefined} />
        </TooltipProvider>
      </ViewStoreProvider>
    </AtlasUIContext.Provider>,
  );
  return { app, store };
}

it('marks the scene the map view shows as open, and follows the view to another scene', () => {
  const { store } = renderCards();
  expect(openWord(CAVE)).toBe('Open');
  expect(screen.getByTestId(CAVE).getAttribute('aria-label')).toBe('Cave, open');
  expect(openWord(MILL)).toBeNull();

  act(() => store.setState({ mapPath: MILL }));
  expect(openWord(CAVE)).toBeNull();
  expect(openWord(MILL)).toBe('Open');
});

it('puts the eye on the scene shown to players, and moves it with the presented scene', () => {
  const { app } = renderCards();
  expect(document.querySelector('.atlas-asset-scene-marks__eye')).toBeNull();

  act(() => presentedSceneOf(app).set({ tabId: 'tab-2', filePath: MILL }));
  const mill = screen.getByTestId(MILL);
  expect(mill.querySelector('.atlas-asset-scene-marks__eye')).not.toBeNull();
  expect(mill.getAttribute('aria-label')).toBe('Cave, shown to players');

  act(() => presentedSceneOf(app).set({ tabId: 'tab-1', filePath: CAVE }));
  expect(mill.querySelector('.atlas-asset-scene-marks__eye')).toBeNull();
  expect(screen.getByTestId(CAVE).getAttribute('aria-label')).toBe('Cave, open, shown to players');
});

it('marks nothing on a card that is no scene', () => {
  const { app } = renderCards();
  act(() => presentedSceneOf(app).set(null));
  expect(screen.getByTestId('token').textContent).toBe('');
  expect(screen.getByTestId('token').getAttribute('aria-label')).toBe('Cave');
});
