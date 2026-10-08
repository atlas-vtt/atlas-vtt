import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildExtension } from '../../src/api/extension';
import { DisposerSet } from '../../src/api/disposers';
import { ApiEvents } from '../../src/api/events';
import { LANDED_CAPABILITIES } from '../../src/api/capabilities';
import { presentationApi } from '../../src/api/presentation';
import { SHOW_TAB_TIMEOUT_MS, viewsApi } from '../../src/api/views';
import type { ViewInfo } from '../../src/api/types/views';
import { initialRemoteViewState } from '../../src/app/remote-view/remoteViewState';
import { presentedScene } from '../../src/app/services/PresentedScene';
import { fakeApp, fakeServices, fakeView, tabbedView, trackerWith, type FakeView } from './apiFakes';

const A = 'maps/a.atlasmap';
const B = 'maps/b.atlasmap';
const C = 'maps/c.atlasmap';

function setup(views: FakeView[]): ReturnType<typeof trackerWith> & { api: ReturnType<typeof viewsApi>; disposers: DisposerSet } {
  const tracked = trackerWith(views);
  const disposers = new DisposerSet();
  return { ...tracked, disposers, api: viewsApi(tracked.tracker, disposers, true) };
}

function remoteView(viewId: string): FakeView {
  const view = fakeView(viewId);
  view.atlasStore.setState({ remoteView: initialRemoteViewState() });
  return view;
}

/** Lets queued microtasks (the coalesced `tabs-changed`) run. */
const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(() => { presentedScene.clear(); });

describe('views.showTab', () => {
  it('C-tabs-3: makes a background tab active without presenting it, and answers true once loaded', async () => {
    const view = tabbedView('v1', [A, B], { autoLoad: true });
    const { api, tracker, disposers } = setup([view]);
    const presentation = presentationApi(tracker, disposers, 'ext');
    presentedScene.present(view, view.tabIds[0]!);
    const presented = presentation.current()!;
    await expect(api.showTab!('v1', view.tabIds[1]!)).resolves.toBe(true);
    expect(api.snapshot('v1')).toMatchObject({ tabId: view.tabIds[1], mapPath: B, loaded: true });
    // Still the same presentation, held while the GM shows another tab, as on any switch.
    expect(presentation.current()).toEqual({ ...presented, held: true });
  });

  it('C-tabs-3: answers true at once for the active tab that is loaded', async () => {
    const view = tabbedView('v1', [A, B]);
    const { api } = setup([view]);
    await expect(api.showTab!('v1', view.tabIds[0]!)).resolves.toBe(true);
  });

  it('C-tabs-3: answers false when another switch overtakes it', async () => {
    const view = tabbedView('v1', [A, B, C], { autoLoad: true });
    const { api } = setup([view]);
    const first = api.showTab!('v1', view.tabIds[1]!);
    const second = api.showTab!('v1', view.tabIds[2]!);
    expect(await Promise.all([first, second])).toEqual([false, true]);
    expect(api.snapshot('v1')!.tabId).toBe(view.tabIds[2]);

    // The GM's own switch overtakes it too.
    const asked = api.showTab!('v1', view.tabIds[0]!);
    void view.switchToTab(view.tabIds[1]!);
    await expect(asked).resolves.toBe(false);
  });

  it('C-tabs-3: answers false for an unknown tab, an unknown or closed view and a remote view, and never throws', async () => {
    const view = tabbedView('v1', [A, B], { autoLoad: true });
    const remote = remoteView('r1');
    const closed = tabbedView('v2', [A, B], { autoLoad: true });
    const { api } = setup([view, remote, closed]);
    closed.close();
    const remoteSwitch = vi.spyOn(remote, 'switchToTab');
    await expect(api.showTab!('v1', 'no-such-tab')).resolves.toBe(false);
    await expect(api.showTab!('nope', view.tabIds[1]!)).resolves.toBe(false);
    await expect(api.showTab!('v2', closed.tabIds[1]!)).resolves.toBe(false);
    await expect(api.showTab!('r1', remote.tabMetaStore.getState().activeTabId!)).resolves.toBe(false);
    expect(remoteSwitch).not.toHaveBeenCalled();
    expect(view.tabMetaStore.getState().activeTabId).toBe(view.tabIds[0]);
  });

  it('C-tabs-3: answers false when the switch fails, and logs it', async () => {
    const view = tabbedView('v1', [A, B]);
    const { api } = setup([view]);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    view.switchToTab = (): Promise<void> => Promise.reject(new Error('disk'));
    await expect(api.showTab!('v1', view.tabIds[1]!)).resolves.toBe(false);
    expect(error).toHaveBeenCalledWith('[Atlas API] views.showTab: switching tabs failed:', expect.any(Error));
    error.mockRestore();
  });

  it('C-tabs-3: answers false when the view closes while the tab loads', async () => {
    const view = tabbedView('v1', [A, B]);
    const { api } = setup([view]);
    const asked = api.showTab!('v1', view.tabIds[1]!);
    await flush();
    expect(view.atlasStore.getState().isMapLoading).toBe(true);
    view.close();
    await expect(asked).resolves.toBe(false);
  });

  it('C-tabs-3: answers false when the view closes after the switch returned but its load was cut short', async () => {
    const view = tabbedView('v1', [A, B]);
    const { api } = setup([view]);
    // As Atlas does when a close supersedes the load: the switch returns and the store is left loading.
    view.switchToTab = (tabId: string): Promise<void> => {
      view.tabMetaStore.getState().setActiveTab(tabId);
      view.atlasStore.setState({ isMapLoading: true, mapLoaded: false });
      return Promise.resolve();
    };
    // Counts the store listeners showTab keeps.
    let listening = 0;
    const subscribe = view.atlasStore.subscribe.bind(view.atlasStore);
    view.atlasStore.subscribe = (listener): (() => void) => {
      listening++;
      const stop = subscribe(listener);
      return (): void => { listening--; stop(); };
    };
    const asked = api.showTab!('v1', view.tabIds[1]!);
    await flush();
    expect(listening).toBe(1);
    view.close();
    await expect(asked).resolves.toBe(false);
    expect(listening).toBe(0);
  });

  it('C-tabs-3: answers false once a load that never ends passes the backstop', async () => {
    vi.useFakeTimers();
    try {
      const view = tabbedView('v1', [A, B]);
      const { api } = setup([view]);
      let answer: boolean | undefined;
      void api.showTab!('v1', view.tabIds[1]!).then((value) => { answer = value; });
      await vi.advanceTimersByTimeAsync(SHOW_TAB_TIMEOUT_MS - 1);
      expect(answer).toBeUndefined();
      await vi.advanceTimersByTimeAsync(1);
      expect(answer).toBe(false);
      // A load that ends after the answer changes nothing.
      view.finishLoad();
      await vi.advanceTimersByTimeAsync(0);
      expect(answer).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('is attached only with the scene-tabs capability', () => {
    const { app } = fakeApp();
    const tracker = trackerWith([]).tracker;
    expect(viewsApi(tracker, new DisposerSet())).not.toHaveProperty('showTab');
    const build = (capabilities: readonly (typeof LANDED_CAPABILITIES)[number][]): ReturnType<typeof buildExtension> => buildExtension(
      { id: 'ext', disposers: new DisposerSet(), events: new ApiEvents(), capabilities: new Set(capabilities) },
      { ...fakeServices(app), views: tracker },
    );
    expect(typeof build(LANDED_CAPABILITIES).views.showTab).toBe('function');
    expect(build(LANDED_CAPABILITIES.filter((name) => name !== 'scene-tabs')).views).not.toHaveProperty('showTab');
  });
});

describe('SceneSnapshot.tabId', () => {
  it('C-tabs-2: is null while the next tab loads and its id once loaded', async () => {
    const view = tabbedView('v1', [A, B]);
    const { api } = setup([view]);
    expect(api.snapshot('v1')!.tabId).toBe(view.tabIds[0]);
    const seen: Array<{ tabId: string | null | undefined; mapPath: string | null }> = [];
    api.subscribe('v1', (snapshot) => seen.push({ tabId: snapshot.tabId, mapPath: snapshot.mapPath }));
    const switched = view.switchToTab(view.tabIds[1]!);
    // Atlas activates the next tab while the store still holds the previous one's scene: the snapshot names no tab.
    expect(view.tabMetaStore.getState().activeTabId).toBe(view.tabIds[1]);
    expect(api.snapshot('v1')).toMatchObject({ tabId: null, mapPath: A, loaded: true });
    expect(seen).toEqual([{ tabId: null, mapPath: A }]);
    await flush();
    expect(api.snapshot('v1')).toMatchObject({ tabId: null, loaded: false });
    view.finishLoad();
    await switched;
    expect(seen.at(-1)).toEqual({ tabId: view.tabIds[1], mapPath: B });
    expect([...new Set(seen.map((entry) => entry.tabId))]).toEqual([null, view.tabIds[1]]);
    // No snapshot ever named a tab whose scene the store did not hold.
    for (const entry of seen) if (entry.tabId === view.tabIds[1]) expect(entry.mapPath).toBe(B);
  });

  it('C-tabs-2: is null in a remote view', () => {
    const remote = remoteView('r1');
    remote.atlasStore.setState({ mapPath: 'remote:r1', mapLoaded: true, isMapLoading: false });
    const { api } = setup([remote]);
    expect(api.snapshot('r1')!.tabId).toBeNull();
  });

  it('C-tabs-2: a subscriber hears the active tab closing, before any load', () => {
    const view = tabbedView('v1', [A, B]);
    const { api } = setup([view]);
    const listener = vi.fn();
    api.subscribe('v1', listener);
    view.tabMetaStore.getState().removeTab(view.tabIds[0]!);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0]![0].tabId).toBeNull();
    // A dirty mark changes no field of the snapshot.
    view.tabMetaStore.getState().markTabDirty(view.tabIds[1]!, true);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe('tabs-changed', () => {
  function heard(views: FakeView[]): { calls: ViewInfo[]; api: ReturnType<typeof viewsApi> } {
    const { events, api } = setup(views);
    const calls: ViewInfo[] = [];
    events.on('tabs-changed', (info) => { calls.push(info); });
    return { calls, api };
  }

  it('C-tabs-1: fires once per view when a background tab closes', async () => {
    const view = tabbedView('v1', [A, B]);
    const { calls } = heard([view]);
    view.tabMetaStore.getState().removeTab(view.tabIds[1]!);
    expect(calls).toHaveLength(0);
    await flush();
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ viewId: 'v1', kind: 'map', activeTabId: view.tabIds[0] });
    expect(calls[0]!.tabs.map((tab) => tab.mapPath)).toEqual([A]);
    expect(Object.isFrozen(calls[0])).toBe(true);
  });

  it('C-tabs-1: fires on rename, reorder and activeTabId, coalesced within a microtask', async () => {
    const view = tabbedView('v1', [A, B]);
    const { calls } = heard([view]);
    const tabs = view.tabMetaStore.getState();
    tabs.updateTabFilePath(B, 'maps/tavern.atlasmap', 'Tavern');
    tabs.setTabs([...view.tabMetaStore.getState().tabs].reverse(), view.tabIds[0]!);
    tabs.setActiveTab(view.tabIds[1]!);
    await flush();
    expect(calls).toHaveLength(1);
    expect(calls[0]!.tabs.map((tab) => tab.name)).toEqual(['Tavern', 'a']);
    expect(calls[0]!.activeTabId).toBe(view.tabIds[1]);

    tabs.setActiveTab(view.tabIds[0]!);
    await flush();
    tabs.setTabs([...view.tabMetaStore.getState().tabs].reverse(), view.tabIds[0]!);
    await flush();
    expect(calls).toHaveLength(3);
  });

  it('C-tabs-1: fires on a switch, and not for marking a tab dirty or loaded', async () => {
    const view = tabbedView('v1', [A, B], { autoLoad: true });
    const { calls, api } = heard([view]);
    view.tabMetaStore.getState().markTabDirty(view.tabIds[0]!, true);
    view.tabMetaStore.getState().markTabLoaded(view.tabIds[1]!);
    await flush();
    expect(calls).toHaveLength(0);
    await api.showTab!('v1', view.tabIds[1]!);
    await flush();
    expect(calls.map((info) => info.activeTabId)).toEqual([view.tabIds[1]]);
  });

  it('C-tabs-1: never fires for a remote view', async () => {
    const remote = remoteView('r1');
    const { calls } = heard([remote]);
    remote.tabMetaStore.getState().addTab('maps/b.atlasmap', 'B');
    await flush();
    expect(calls).toHaveLength(0);
  });

  it('C-tabs-1: stops when the view closes, even with a change queued', async () => {
    const view = tabbedView('v1', [A, B]);
    const { calls } = heard([view]);
    view.tabMetaStore.getState().removeTab(view.tabIds[1]!);
    view.close();
    await flush();
    view.tabMetaStore.getState().removeTab(view.tabIds[0]!);
    await flush();
    expect(calls).toHaveLength(0);
  });
});
