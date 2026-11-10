// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Notice } from 'obsidian';
import { createInMemoryApp } from '../mocks/inMemoryVault';

const hiddenNotices = vi.hoisted((): string[] => []);
vi.mock('obsidian', async (importOriginal) => ({
  ...(await importOriginal<typeof import('obsidian')>()),
  Notice: vi.fn(function (this: { hide: () => void }, message: string) {
    this.hide = (): void => { hiddenNotices.push(message); };
  }),
}));

import { MAP_UI_ROOT_OPTIONS, PanelBoundary } from '../../src/app/react/root/PanelBoundary';
import { ViewStoreProvider, useAtlasStore } from '../../src/app/react/ViewStoreContext';
import { createViewAtlasStore, type ViewAtlasStore } from '../../src/app/storeFactory';

/** A panel that cannot render what the Cave scene holds, as the initiative tracker could not. */
const BrokenOnCave: React.FC = () => {
  const dmNotePath = useAtlasStore((state) => state.dmNotePath);
  if (dmNotePath === 'cave') throw new TypeError("Cannot read properties of undefined (reading 'max')");
  return <p>Initiative</p>;
};

/** The store side of a scene load: the path is set first, the scene's data arrives later. */
function loadScene(target: ViewAtlasStore, mapPath: string, dmNotePath: string): void {
  act(() => target.setState({ isMapLoading: true, mapPath }));
  act(() => target.setState({ dmNotePath }));
  act(() => target.setState({ isMapLoading: false }));
}

const unmounted = vi.fn();
const MapImage: React.FC = () => {
  React.useEffect(() => unmounted, []);
  return <p>Map image</p>;
};

let root: Root;
let container: HTMLElement;
let store: ViewAtlasStore;
let logged: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  // The root is created here, not by Testing Library, to give it the map UI's options
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  unmounted.mockClear();
  hiddenNotices.length = 0;
  vi.mocked(Notice).mockClear();
  logged = vi.spyOn(console, 'error').mockImplementation(() => {});
  store = createViewAtlasStore(createInMemoryApp().app, 'panel-boundary-test');
  store.setState({ mapPath: 'maps/cave.atlasmap', dmNotePath: 'cave' });
  container = document.body.appendChild(document.createElement('div'));
  root = createRoot(container, MAP_UI_ROOT_OPTIONS);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

function show(panel: React.ReactNode): void {
  act(() => root.render(
    <ViewStoreProvider store={store}>
      <MapImage />
      {panel}
      <PanelBoundary name="the toolbar"><p>Toolbar</p></PanelBoundary>
    </ViewStoreProvider>,
  ));
}

describe('a map panel that fails to render', () => {
  it('takes the whole map UI down without a boundary', () => {
    store.setState({ dmNotePath: 'tower' });
    show(<BrokenOnCave />);

    expect(() => act(() => store.setState({ dmNotePath: 'cave' }))).toThrow("reading 'max'");

    expect(container.textContent).toBe('');
    expect(unmounted).toHaveBeenCalledTimes(1);
  });

  it('shows nothing itself while the map image and the other panels stay', () => {
    show(<PanelBoundary name="the initiative tracker"><BrokenOnCave /></PanelBoundary>);

    expect(container.textContent).toBe('Map imageToolbar');
    expect(unmounted).not.toHaveBeenCalled();
  });

  it('tells the GM once which part is missing, and logs the error once', () => {
    show(<PanelBoundary name="the initiative tracker"><BrokenOnCave /></PanelBoundary>);
    act(() => store.getState().setGridVisible(false));

    expect(Notice).toHaveBeenCalledTimes(1);
    expect(Notice).toHaveBeenCalledWith('Atlas VTT could not show the initiative tracker. The rest of the map keeps working.', 0);
    expect(logged).toHaveBeenCalledTimes(1);
    expect(logged.mock.calls[0]?.[0]).toBe('[Atlas VTT] Could not show the initiative tracker:');
    expect(logged.mock.calls[0]?.[1]).toBeInstanceOf(TypeError);
  });

  it('is shown again once the next scene has loaded, not while it still holds the old data', () => {
    show(<PanelBoundary name="the initiative tracker"><BrokenOnCave /></PanelBoundary>);

    loadScene(store, 'maps/tower.atlasmap', 'tower');

    expect(container.textContent).toBe('Map imageInitiativeToolbar');
    expect(Notice).toHaveBeenCalledTimes(1);
    expect(unmounted).not.toHaveBeenCalled();
  });

  it('is tried again when the same scene is loaded again', () => {
    show(<PanelBoundary name="the initiative tracker"><BrokenOnCave /></PanelBoundary>);
    act(() => store.setState({ isMapLoading: true }));
    act(() => store.setState({ dmNotePath: 'cave, repaired', isMapLoading: false }));

    expect(container.textContent).toBe('Map imageInitiativeToolbar');
  });

  it('reports a scene it cannot show once, though it fails while loading and again when retried', () => {
    store.setState({ dmNotePath: 'tower' });
    show(<PanelBoundary name="the initiative tracker"><BrokenOnCave /></PanelBoundary>);

    loadScene(store, 'maps/cave.atlasmap', 'cave');

    expect(container.textContent).toBe('Map imageToolbar');
    expect(Notice).toHaveBeenCalledTimes(1);
    expect(logged).toHaveBeenCalledTimes(1);

    loadScene(store, 'maps/cave.atlasmap', 'cave');
    expect(Notice).toHaveBeenCalledTimes(2);
    // The notice stays until it is clicked: the one before it must not pile up under the new one
    expect(hiddenNotices).toHaveLength(1);
  });
});
