import { describe, expect, it, vi } from 'vitest';
import { createStore } from 'zustand/vanilla';
import { createTabMetaStore } from '../../src/app/stores/tabMetaStore';
import { LaserHub } from '../../src/app/pixi/laser/LaserHub';
import { PresentedScene, type PresentedView } from '../../src/app/services/PresentedScene';

/** What the presented scene reads of a view's store: whether, and which, map it holds. */
interface SceneState { isMapLoading: boolean; mapLoaded: boolean; mapPath: string | null }

interface FakeView {
  view: PresentedView;
  tabs: ReturnType<typeof createTabMetaStore>;
  store: ReturnType<typeof createStore<SceneState>>;
  register: ReturnType<typeof vi.fn>;
  close(): void;
  tavern: string;
  dungeon: string;
}

function fakeView(renderer?: PresentedView['renderer']): FakeView {
  const tabs = createTabMetaStore();
  // The view holds Tavern's map; browsing other tabs in these tests never loads another one.
  const store = createStore<SceneState>(() => ({ isMapLoading: false, mapLoaded: true, mapPath: 'maps/tavern.atlasmap' }));
  const closers: Array<() => void> = [];
  const register = vi.fn((callback: () => void) => { closers.push(callback); });
  const tavern = tabs.getState().addTab('maps/tavern.atlasmap', 'Tavern');
  const dungeon = tabs.getState().addTab('maps/dungeon.atlasmap', 'Dungeon');
  tabs.getState().setActiveTab(tavern);
  const view = { tabMetaStore: tabs, atlasStore: store, register, ...(renderer !== undefined ? { renderer } : {}) } as unknown as PresentedView;
  return { view, tabs, store, register, close: () => closers.forEach((callback) => callback()), tavern, dungeon };
}

function record(scene: PresentedScene): string[] {
  const events: string[] = [];
  scene.subscribe({
    presented: (info, resumed) => events.push(`${resumed ? 'resumed' : 'presented'}:${info.tabId}`),
    held: (info) => events.push(`held:${info.tabId}`),
    cleared: (info) => events.push(`cleared:${info.tabId}`),
  });
  return events;
}

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

describe('PresentedScene', () => {
  it('presents a tab of a view', () => {
    const scene = new PresentedScene();
    const events = record(scene);
    const { view, tavern, store } = fakeView();
    scene.present(view, tavern);
    expect(events).toEqual([`presented:${tavern}`]);
    expect(scene.current()).toMatchObject({ view, tabId: tavern, store });
    expect(scene.isHeld()).toBe(false);
  });

  it('holds once while the GM browses other tabs', () => {
    const scene = new PresentedScene();
    const events = record(scene);
    const { view, tabs, tavern, dungeon } = fakeView();
    scene.present(view, tavern);
    tabs.getState().setActiveTab(dungeon);
    tabs.getState().markTabDirty(dungeon, true);
    expect(events).toEqual([`presented:${tavern}`, `held:${tavern}`]);
    expect(scene.isHeld()).toBe(true);
  });

  it('resumes once the presented tab is back and its map has loaded', async () => {
    const scene = new PresentedScene();
    const events = record(scene);
    const { view, tabs, store, tavern, dungeon } = fakeView();
    scene.present(view, tavern);
    tabs.getState().setActiveTab(dungeon);
    store.setState({ isMapLoading: true });
    tabs.getState().setActiveTab(tavern);
    await flush();
    expect(events.at(-1)).toBe(`held:${tavern}`);
    store.setState({ isMapLoading: false });
    await flush();
    expect(events.at(-1)).toBe(`resumed:${tavern}`);
    expect(scene.isHeld()).toBe(false);
  });

  it('waits for a load that starts right after switching back', async () => {
    const scene = new PresentedScene();
    const events = record(scene);
    const { view, tabs, store, tavern, dungeon } = fakeView();
    scene.present(view, tavern);
    tabs.getState().setActiveTab(dungeon);
    tabs.getState().setActiveTab(tavern);
    store.setState({ isMapLoading: true });
    await flush();
    expect(events.at(-1)).toBe(`held:${tavern}`);
    store.setState({ isMapLoading: false });
    await flush();
    expect(events.at(-1)).toBe(`resumed:${tavern}`);
  });

  it('clears when the presented view closes, and ignores it afterwards', () => {
    const scene = new PresentedScene();
    const events = record(scene);
    const { view, tabs, close, tavern, dungeon } = fakeView();
    scene.present(view, tavern);
    close();
    expect(events).toEqual([`presented:${tavern}`, `cleared:${tavern}`]);
    expect(scene.current()).toBeNull();
    tabs.getState().setActiveTab(dungeon);
    expect(events).toHaveLength(2);
  });

  it('clears when the presented tab is closed', () => {
    const scene = new PresentedScene();
    const events = record(scene);
    const { view, tabs, tavern } = fakeView();
    scene.present(view, tavern);
    tabs.getState().removeTab(tavern);
    expect(events.at(-1)).toBe(`cleared:${tavern}`);
  });

  it('replaces the presented scene and registers each view once', () => {
    const scene = new PresentedScene();
    const events = record(scene);
    const first = fakeView();
    const second = fakeView();
    scene.present(first.view, first.tavern);
    scene.present(first.view, first.tavern);
    scene.present(second.view, second.tavern);
    expect(first.register).toHaveBeenCalledTimes(1);
    first.tabs.getState().setActiveTab(first.dungeon);
    first.close();
    expect(events).toEqual([`presented:${first.tavern}`, `presented:${first.tavern}`, `presented:${second.tavern}`]);
    expect(scene.current()?.view).toBe(second.view);
  });

  it('ignores a view that has closed: nothing would ever clear it', () => {
    const scene = new PresentedScene();
    const events = record(scene);
    const open = fakeView();
    const closed = fakeView();
    scene.present(open.view, open.tavern);
    (closed.view as { isClosed?: boolean }).isClosed = true;
    scene.present(closed.view, closed.tavern);
    expect(scene.current()?.view).toBe(open.view);
    expect(closed.register).not.toHaveBeenCalled();
    expect(events).toEqual([`presented:${open.tavern}`]);
  });

  it('starts held when the view shows another tab', () => {
    const scene = new PresentedScene();
    const events = record(scene);
    const { view, dungeon } = fakeView();
    scene.present(view, dungeon);
    expect(events).toEqual([`held:${dungeon}`]);
  });

  it('reads the map size from the loaded background', () => {
    const scene = new PresentedScene();
    const plain = fakeView();
    scene.present(plain.view, plain.tavern);
    expect(scene.current()?.mapSize()).toEqual({ width: 0, height: 0 });
    const sprite = { width: 1000, height: 500, destroyed: false };
    const withMap = fakeView({ getBackgroundSprite: () => sprite });
    scene.present(withMap.view, withMap.tavern);
    expect(scene.current()?.mapSize()).toEqual({ width: 1000, height: 500 });
    sprite.destroyed = true;
    expect(scene.current()?.mapSize()).toEqual({ width: 0, height: 0 });
  });

  it('does nothing when cleared with nothing presented', () => {
    const scene = new PresentedScene();
    const events = record(scene);
    scene.clear();
    expect(events).toEqual([]);
  });

  it('reports a closing view even when another scene is presented', () => {
    const scene = new PresentedScene();
    const closed: PresentedView[] = [];
    scene.subscribe({ viewClosed: (view) => closed.push(view) });
    const first = fakeView();
    const second = fakeView();
    scene.present(first.view, first.tavern);
    scene.present(second.view, second.tavern);
    first.close();
    expect(closed).toEqual([first.view]);
    expect(scene.current()?.view).toBe(second.view);
  });

  it('starts held when the store does not hold the tab, and resumes once its map is loaded', async () => {
    const scene = new PresentedScene();
    const events = record(scene);
    const { view, store, tavern } = fakeView();
    store.setState({ mapLoaded: false });
    scene.present(view, tavern);
    expect(scene.isHeld()).toBe(true);
    store.setState({ mapLoaded: true });
    await flush();
    expect(scene.isHeld()).toBe(false);
    expect(events).toEqual([`held:${tavern}`, `resumed:${tavern}`]);
  });

  it('keeps telling the other listeners when one throws', () => {
    const scene = new PresentedScene();
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const events = record(scene);
    scene.subscribe({ presented: () => { throw new Error('boom'); } });
    const view = fakeView();
    scene.present(view.view, view.tavern);
    scene.subscribe({ cleared: () => { throw new Error('boom'); } });
    expect(() => scene.clear()).not.toThrow();
    expect(events.length).toBeGreaterThan(1);
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  it("gives the presented view's laser hub, or null without a renderer", () => {
    const hub = new LaserHub();
    const withHub = fakeView({ getBackgroundSprite: () => null, getLaserHub: () => hub });
    const without = fakeView();
    const scene = new PresentedScene();
    const lasers: Array<LaserHub | null> = [];
    scene.subscribe({ presented: (info) => lasers.push(info.laser()) });
    scene.present(withHub.view, withHub.tavern);
    scene.present(without.view, without.tavern);
    expect(lasers).toEqual([hub, null]);
  });
});
