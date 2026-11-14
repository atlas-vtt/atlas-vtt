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

import { MAP_UI_ROOT_OPTIONS, PANEL_RETRY_DELAYS_MS, PANEL_SETTLED_MS, PanelBoundary } from '../../src/app/react/root/PanelBoundary';
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
  vi.useFakeTimers();
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
  vi.useRealTimers();
});

/** Lets `ms` pass, with whatever the boundary does in that time. */
function wait(ms: number): void {
  act(() => { vi.advanceTimersByTime(ms); });
}

const [FIRST_RETRY, SECOND_RETRY, THIRD_RETRY] = PANEL_RETRY_DELAYS_MS as [number, number, number];
const ALL_RETRIES = FIRST_RETRY + SECOND_RETRY + THIRD_RETRY;

/** Lets every try the boundary makes by itself come and go: each is set once the one before it has failed. */
function waitOutRetries(): void {
  for (const delay of PANEL_RETRY_DELAYS_MS) wait(delay);
}

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
    expect(Notice).not.toHaveBeenCalled();

    wait(FIRST_RETRY);
    expect(Notice).toHaveBeenCalledTimes(1);
    act(() => store.getState().setGridVisible(false));
    wait(SECOND_RETRY);
    wait(THIRD_RETRY);

    expect(Notice).toHaveBeenCalledTimes(1);
    expect(Notice).toHaveBeenCalledWith('Atlas VTT could not show the initiative tracker. The rest of the map keeps working.', 0);
    expect(logged).toHaveBeenCalledTimes(1);
    expect(logged.mock.calls[0]?.[0]).toBe('[Atlas VTT] Could not show the initiative tracker:');
    expect(logged.mock.calls[0]?.[1]).toBeInstanceOf(TypeError);
  });

  it('is shown again once the next scene has loaded, not while it still holds the old data', () => {
    show(<PanelBoundary name="the initiative tracker"><BrokenOnCave /></PanelBoundary>);
    waitOutRetries();

    loadScene(store, 'maps/tower.atlasmap', 'tower');

    expect(container.textContent).toBe('Map imageInitiativeToolbar');
    expect(Notice).toHaveBeenCalledTimes(1);
    expect(unmounted).not.toHaveBeenCalled();
    // What the notice says no longer holds once the tracker has stayed
    expect(hiddenNotices).toHaveLength(0);
    wait(PANEL_SETTLED_MS);
    expect(hiddenNotices).toHaveLength(1);
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
    waitOutRetries();

    expect(container.textContent).toBe('Map imageToolbar');
    expect(Notice).toHaveBeenCalledTimes(1);
    expect(logged).toHaveBeenCalledTimes(1);

    loadScene(store, 'maps/cave.atlasmap', 'cave');
    waitOutRetries();
    expect(Notice).toHaveBeenCalledTimes(2);
    // The notice stays until it is clicked: the one before it must not pile up under the new one
    expect(hiddenNotices).toHaveLength(1);
  });

  it('is not tried by itself while a scene loads, when the store mixes two scenes', () => {
    store.setState({ dmNotePath: 'tower' });
    show(<PanelBoundary name="the initiative tracker"><BrokenOnCave /></PanelBoundary>);
    act(() => store.setState({ isMapLoading: true, dmNotePath: 'cave' }));
    act(() => store.setState({ dmNotePath: 'tower' }));

    waitOutRetries();
    expect(container.textContent).toBe('Map imageToolbar');

    act(() => store.setState({ isMapLoading: false }));
    expect(container.textContent).toBe('Map imageInitiativeToolbar');
  });
});

/**
 * A surface that throws until `healsAfter` ms have passed, as one whose animation could not start: nothing
 * in the scene is wrong. `tries` counts the moments it was rendered at; React itself renders a failed surface twice.
 */
function failingFor(healsAfter: number): { Surface: React.FC; tries: () => number } {
  const start = Date.now();
  const moments = new Set<number>();
  const Surface: React.FC = () => {
    moments.add(Date.now());
    if (Date.now() - start < healsAfter) throw new TypeError("Cannot set properties of null (setting 'startTime')");
    return <p>Fog tools</p>;
  };
  return { Surface, tries: () => moments.size };
}

describe('a map panel that fails for no reason of the scene', () => {
  beforeEach(() => {
    store.setState({ dmNotePath: 'tower' });
  });

  it('is back by itself a moment later, without a word to the GM', () => {
    const { Surface, tries } = failingFor(1);
    show(<PanelBoundary name="the fog tools"><Surface /></PanelBoundary>);
    expect(container.textContent).toBe('Map imageToolbar');

    wait(FIRST_RETRY - 1);
    expect(container.textContent).toBe('Map imageToolbar');
    wait(1);

    expect(container.textContent).toBe('Map imageFog toolsToolbar');
    wait(60_000);
    expect(tries()).toBe(2);
    expect(Notice).not.toHaveBeenCalled();
    expect(logged).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('is tried a second time later, and the notice of its absence goes once it has stayed', () => {
    const { Surface, tries } = failingFor(FIRST_RETRY + 1);
    show(<PanelBoundary name="the fog tools"><Surface /></PanelBoundary>);

    wait(FIRST_RETRY);
    expect(container.textContent).toBe('Map imageToolbar');
    expect(Notice).toHaveBeenCalledTimes(1);
    wait(SECOND_RETRY - 1);
    expect(tries()).toBe(2);
    wait(1);

    expect(container.textContent).toBe('Map imageFog toolsToolbar');
    expect(hiddenNotices).toHaveLength(0);
    wait(PANEL_SETTLED_MS);
    expect(hiddenNotices).toEqual(['Atlas VTT could not show the fog tools. The rest of the map keeps working.']);
    expect(Notice).toHaveBeenCalledTimes(1);
    expect(logged).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('stays out after three tries: no further try, one notice, one log', () => {
    const { Surface, tries } = failingFor(Infinity);
    show(<PanelBoundary name="the fog tools"><Surface /></PanelBoundary>);

    waitOutRetries();
    expect(tries()).toBe(1 + PANEL_RETRY_DELAYS_MS.length);
    expect(vi.getTimerCount()).toBe(0);

    wait(600_000);
    act(() => store.getState().setGridVisible(false));
    expect(tries()).toBe(1 + PANEL_RETRY_DELAYS_MS.length);
    expect(container.textContent).toBe('Map imageToolbar');
    expect(Notice).toHaveBeenCalledTimes(1);
    expect(hiddenNotices).toHaveLength(0);
    expect(logged).toHaveBeenCalledTimes(1);
  });

  it('is still tried again after the next scene load once it has given up', () => {
    const { Surface, tries } = failingFor(ALL_RETRIES + 1);
    show(<PanelBoundary name="the fog tools"><Surface /></PanelBoundary>);
    waitOutRetries();
    wait(1);
    expect(container.textContent).toBe('Map imageToolbar');

    loadScene(store, 'maps/tower.atlasmap', 'tower');

    expect(container.textContent).toBe('Map imageFog toolsToolbar');
    expect(tries()).toBe(2 + PANEL_RETRY_DELAYS_MS.length);
  });

  it('counts a failure soon after it came back as the same one, and a later failure anew', () => {
    let broken = true;
    let renders = 0;
    const Surface: React.FC = () => {
      useAtlasStore((state) => state.grid.visible);
      renders += 1;
      if (broken) throw new TypeError('The animation could not start');
      return <p>Fog tools</p>;
    };
    const breakAgain = (): void => {
      broken = true;
      act(() => store.getState().setGridVisible(!store.getState().grid.visible));
    };
    /** The tries the surface was given, each of which found it whole again. */
    const recover = (delay: number): void => {
      broken = false;
      wait(delay);
      expect(container.textContent).toBe('Map imageFog toolsToolbar');
    };
    show(<PanelBoundary name="the fog tools"><Surface /></PanelBoundary>);
    recover(FIRST_RETRY);

    // Before it has held, each failure uses up one more of the three tries
    breakAgain();
    recover(SECOND_RETRY);
    breakAgain();
    recover(THIRD_RETRY);
    breakAgain();
    broken = false;
    const given = renders;
    wait(600_000);
    expect(renders).toBe(given);
    expect(container.textContent).toBe('Map imageToolbar');

    // A scene load shows it again; once it has held, its next failure gets its tries back
    loadScene(store, 'maps/tower.atlasmap', 'tower');
    wait(PANEL_SETTLED_MS);
    breakAgain();
    recover(FIRST_RETRY);
  });
});
