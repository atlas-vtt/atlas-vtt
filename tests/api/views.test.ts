import { describe, expect, it, vi } from 'vitest';
import { DisposerSet } from '../../src/api/disposers';
import { viewsApi } from '../../src/api/views';
import { initialRemoteViewState } from '../../src/app/remote-view/remoteViewState';
import { FakeViewport } from './fakeViewport';
import { fakeView, loadMap, trackerWith, type FakeView } from './apiFakes';

/** Freezes the fake store's records as Immer leaves them after a draft update. */
function deepFreezeState(view: FakeView): void {
  const state = view.atlasStore.getState();
  for (const value of [state.objects, state.objects.tokens, state.objects.texts, state.objects.drawings, state.objects.fog, state.widgetSettings, state.lighting, state.grid]) if (value) Object.freeze(value);
}

function setup(views: FakeView[], active: () => FakeView | null = () => null): ReturnType<typeof trackerWith> & { api: ReturnType<typeof viewsApi>; disposers: DisposerSet } {
  const tracked = trackerWith(views, active);
  const disposers = new DisposerSet();
  return { ...tracked, disposers, api: viewsApi(tracked.tracker, disposers) };
}

describe('views', () => {
  it('C-views-1: snapshot is null for an unknown or closed view', () => {
    const view = fakeView('v1');
    const { api } = setup([view]);
    expect(api.snapshot('nope')).toBeNull();
    view.close();
    expect(api.snapshot('v1')).toBeNull();
  });

  it('C-views-2: loaded is false while the map loads; subscribe fires on a replaced field, not on the camera', () => {
    const view = fakeView('v1');
    const { api } = setup([view]);
    view.atlasStore.setState({ mapPath: 'maps/a.atlasmap', mapLoaded: true, isMapLoading: true });
    expect(api.snapshot('v1')!.loaded).toBe(false);
    loadMap(view);
    const listener = vi.fn();
    api.subscribe('v1', listener);
    view.atlasStore.getState().setCamera({ zoom: 2 });
    expect(listener).not.toHaveBeenCalled();
    view.atlasStore.setState((state) => ({ objects: { ...state.objects, tokens: { ...state.objects.tokens } } }));
    expect(listener).toHaveBeenCalledTimes(1);
    const snapshot = listener.mock.calls[0]![0];
    expect(snapshot.objects.tokens).toBe(view.atlasStore.getState().objects.tokens);
    expect(snapshot.mapSize).toEqual({ width: 1000, height: 500 });
  });

  it('C-views-2: a snapshot passes the store records by reference and carries no pins, walls, lights or audio', () => {
    const view = fakeView('v1');
    const { api } = setup([view]);
    loadMap(view);
    // As Immer leaves the records after a draft update, which every edit makes.
    deepFreezeState(view);
    const state = view.atlasStore.getState();
    const snapshot = api.snapshot('v1')!;
    expect(snapshot.objects.fog).toBe(state.objects.fog);
    expect(snapshot.objects.texts).toBe(state.objects.texts);
    expect(snapshot.objects.drawings).toBe(state.objects.drawings);
    expect(snapshot.widgets.settings).toBe(state.widgetSettings);
    expect(snapshot.lighting).toBe(state.lighting);
    expect(snapshot.grid).toBe(state.grid);
    expect(Object.keys(snapshot.objects).sort()).toEqual(['drawings', 'fog', 'texts', 'tokens']);
    expect(Object.isFrozen(snapshot)).toBe(true);
  });

  it('C-views-2: records the store has not frozen yet (a map just loaded) reach a listener as frozen copies, the same while they stay', () => {
    const view = fakeView('v1');
    const { api } = setup([view]);
    loadMap(view);
    const state = view.atlasStore.getState();
    expect(Object.isFrozen(state.objects.tokens)).toBe(false);
    const snapshot = api.snapshot('v1')!;
    for (const value of [snapshot.objects.tokens, snapshot.objects.fog, snapshot.grid, snapshot.widgets.settings, snapshot.initiative, snapshot.lighting, snapshot.mapSize]) {
      expect(Object.isFrozen(value)).toBe(true);
    }
    expect(() => { (snapshot.objects.tokens as Record<string, unknown>).x = 1; }).toThrow();
    expect(state.objects.tokens).not.toHaveProperty('x');
    expect(api.snapshot('v1')!.objects.tokens).toBe(snapshot.objects.tokens);
  });

  it('C-views-4: what list, active and map-loaded describe is frozen, so one extension cannot change it for another', () => {
    const view = fakeView('v1');
    const { api, events } = setup([view], () => view);
    const heard: unknown[] = [];
    events.on('map-loaded', (info) => heard.push(info));
    loadMap(view);
    for (const info of [api.list()[0], api.active(), heard[0]]) {
      expect(Object.isFrozen(info)).toBe(true);
      expect(Object.isFrozen((info as { tabs: unknown }).tabs)).toBe(true);
    }
  });

  it('C-views-4: map-loaded fires once per load, map-closed once on close', () => {
    const view = fakeView('v1');
    const { events } = setup([view]);
    const loaded = vi.fn();
    const closed = vi.fn();
    events.on('map-loaded', loaded);
    events.on('map-closed', closed);
    loadMap(view);
    loadMap(view);
    expect(loaded).toHaveBeenCalledTimes(1);
    expect(loaded.mock.calls[0]![0]).toMatchObject({ viewId: 'v1', kind: 'map', mapPath: 'maps/a.atlasmap', loaded: true });
    view.close();
    view.close();
    expect(closed).toHaveBeenCalledTimes(1);
    expect(closed).toHaveBeenCalledWith('v1');
  });

  it('C-views-3: lists map views as kind map, picked up on layout change', () => {
    const views = [fakeView('v1')];
    const { api, layoutChanged } = setup(views);
    views.push(fakeView('v2'));
    layoutChanged();
    expect(api.list().map((info) => info.viewId)).toEqual(['v1', 'v2']);
    expect(api.list().every((info) => info.kind === 'map')).toBe(true);
  });

  it("C-views-3: active is the workspace's active map view, or null when there is none or it is not tracked", () => {
    const first = fakeView('v1');
    let current: FakeView | null = null;
    const { api } = setup([first], () => current);
    expect(api.active()).toBeNull();
    current = first;
    expect(api.active()?.viewId).toBe('v1');
    current = fakeView('v3');
    expect(api.active()).toBeNull();
    current = first;
    first.close();
    expect(api.active()).toBeNull();
  });

  it('C-views-3: a remote view is listed as remote and is never active', () => {
    const remote = fakeView('r1');
    remote.atlasStore.setState({ remoteView: initialRemoteViewState() });
    const { api } = setup([fakeView('v1'), remote], () => remote);
    expect(api.list().map((info) => [info.viewId, info.kind])).toEqual([['v1', 'map'], ['r1', 'remote']]);
    expect(api.active()).toBeNull();
  });

  it('C-views-5: camera is null without a viewport, and watchCamera is a harmless no-op', () => {
    const view = fakeView('v1');
    const { api } = setup([view]);
    expect(api.camera('v1')).toBeNull();
    const stop = api.watchCamera('v1', () => undefined);
    stop();
    stop();
  });

  it('C-views-5: camera and watchCamera give the visible world area, frozen, after each frame', () => {
    const viewport = new FakeViewport();
    const view = fakeView('v1', { viewport });
    const { api } = setup([view]);
    expect(api.camera('v1')).toEqual({ centerX: 500, centerY: 400, width: 800, height: 600 });
    expect(Object.isFrozen(api.camera('v1'))).toBe(true);
    const cameras = vi.fn();
    api.watchCamera('v1', cameras);
    viewport.center = { x: 10, y: 20 };
    viewport.frame();
    expect(cameras).toHaveBeenLastCalledWith({ centerX: 10, centerY: 20, width: 800, height: 600 });
    expect(Object.isFrozen(cameras.mock.calls[0]![0])).toBe(true);
  });

  it('C-views-6: closing a view disposes its subscribe and watchCamera registrations; nothing fires after', () => {
    const viewport = new FakeViewport();
    const view = fakeView('v1', { viewport });
    const { api, disposers } = setup([view]);
    loadMap(view);
    const snapshots = vi.fn();
    const cameras = vi.fn();
    api.subscribe('v1', snapshots);
    api.watchCamera('v1', cameras);
    expect(disposers.size).toBe(2);
    expect(viewport.listenerCount).toBe(1);
    view.close();
    expect(disposers.size).toBe(0);
    expect(viewport.listenerCount).toBe(0);
    view.atlasStore.setState((state) => ({ objects: { ...state.objects, tokens: { ...state.objects.tokens } } }));
    viewport.frame();
    expect(snapshots).not.toHaveBeenCalled();
    expect(cameras).not.toHaveBeenCalled();
  });

  it('C-views-6: a store write after isClosed flips, before the close callbacks run, reaches no listener', () => {
    const view = fakeView('v1');
    const { api } = setup([view]);
    loadMap(view);
    const listener = vi.fn();
    api.subscribe('v1', listener);
    Object.defineProperty(view, 'isClosed', { get: () => true });
    view.atlasStore.setState((state) => ({ objects: { ...state.objects, tokens: { ...state.objects.tokens } } }));
    expect(listener).not.toHaveBeenCalled();
  });

  it('C-views-6: a disposed subscription is not disposed again by the close', () => {
    const view = fakeView('v1');
    const { api, disposers } = setup([view]);
    api.subscribe('v1', vi.fn())();
    expect(disposers.size).toBe(0);
    expect(() => view.close()).not.toThrow();
  });

  it('C-views-7: a throwing listener is logged and stops neither the store nor later subscribers', () => {
    const viewport = new FakeViewport();
    const view = fakeView('v1', { viewport });
    const { api } = setup([view]);
    loadMap(view);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const later = vi.fn();
    const frames = vi.fn();
    api.subscribe('v1', () => { throw new Error('boom'); });
    view.atlasStore.subscribe(later);
    api.watchCamera('v1', () => { throw new Error('boom'); });
    viewport.on('frame-end', frames);
    const change = (): void => view.atlasStore.setState((state) => ({ objects: { ...state.objects, tokens: { ...state.objects.tokens } } }));
    expect(change).not.toThrow();
    expect(later).toHaveBeenCalledTimes(1);
    expect(() => viewport.frame()).not.toThrow();
    expect(frames).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledTimes(2);
    error.mockRestore();
  });
});
