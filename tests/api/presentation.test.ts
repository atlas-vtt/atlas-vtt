import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/app/atlas-view', () => ({ AtlasView: class AtlasView {}, ATLAS_VIEW_TYPE: 'atlas-vtt' }));
vi.mock('../../src/app/dashboard-view', () => ({ DASHBOARD_VIEW_TYPE: 'dashboard' }));
const presenter = vi.hoisted(() => ({ presentTabInPlayerWindow: vi.fn() }));
vi.mock('../../src/app/services/PlayerWindowPresenter', () => ({ presentActiveTabInPlayerWindow: vi.fn(), presentTabInPlayerWindow: presenter.presentTabInPlayerWindow }));
vi.mock('obsidian', async (importOriginal) => ({ ...(await importOriginal<Record<string, unknown>>()), Notice: vi.fn() }));

import { AtlasView } from '../../src/app/atlas-view';
import { DisposerSet } from '../../src/api/disposers';
import { presentationApi } from '../../src/api/presentation';
import { PresentedScene, presentedScene } from '../../src/app/services/PresentedScene';
import { activePresentationTarget, addPresentationTarget, tabBadgeFor } from '../../src/app/services/presentationTargets';
import { playerWindowStore } from '../../src/app/stores/playerWindowStore';
import { fakeView, loadMap as load, trackerWith, type FakeView } from './apiFakes';

function setupWith(view: FakeView): { presentation: ReturnType<typeof presentationApi>; disposers: DisposerSet } {
  // The present path recognises Atlas's views by class.
  Object.setPrototypeOf(view, AtlasView.prototype);
  load(view);
  const disposers = new DisposerSet();
  return { presentation: presentationApi(trackerWith([view]).tracker, disposers, 'ext', true), disposers };
}

describe('presentation', () => {
  // Atlas presents a scene of its own only while a target is registered; one that is never active is enough.
  let removeTarget: () => void = () => undefined;
  beforeEach(() => {
    presentedScene.clear();
    playerWindowStore.setState({ isOpen: true });
    removeTarget = addPresentationTarget({ id: 'registered', label: 'an audience', isActive: () => false }, 'other');
  });
  afterEach(() => { removeTarget(); presentedScene.clear(); });

  it('C-pres-1: present returns false for a closed view; held on tab switch; resumed only after the tab loaded; cleared when the tab closes', async () => {
    const view = fakeView('v1');
    const { presentation } = setupWith(view);
    const seen: string[] = [];
    presentation.subscribe({
      presented: (scene, resumed) => seen.push(`presented:${scene.tabId}:${resumed}`),
      held: (scene) => seen.push(`held:${scene.tabId}`),
      cleared: () => seen.push('cleared'),
    });
    const tabId = view.tabMetaStore.getState().activeTabId!;
    expect(await presentation.present('v1', tabId)).toBe(true);
    expect(presentation.current()).toMatchObject({ viewId: 'v1', tabId, mapPath: 'maps/a.atlasmap', held: false });
    expect(Object.isFrozen(presentation.current())).toBe(true);
    const other = view.tabMetaStore.getState().addTab('maps/b.atlasmap', 'B');
    expect(seen.at(-1)).toBe(`held:${tabId}`);
    view.atlasStore.setState({ isMapLoading: true });
    view.tabMetaStore.getState().setActiveTab(tabId);
    await Promise.resolve();
    expect(seen.at(-1)).toBe(`held:${tabId}`);           // still loading: no resume
    load(view);
    await Promise.resolve();
    expect(seen.at(-1)).toBe(`presented:${tabId}:true`);
    view.tabMetaStore.getState().removeTab(tabId);
    expect(seen.at(-1)).toBe('cleared');
    view.close();
    expect(await presentation.present('v1')).toBe(false);
    void other;
  });

  it('C-pres-2: addTarget makes a target active for the eye; its disposer removes it', () => {
    const { presentation } = setupWith(fakeView('v1'));
    const stop = presentation.addTarget({ id: 'screen', label: 'the second screen', isActive: () => true });
    expect(activePresentationTarget()?.label).toBe('the second screen');
    stop();
    stop();
    expect(activePresentationTarget()).toBeNull();
  });

  it('present resolves false when the scene stays held (its map did not load), and stop clears the scene', async () => {
    const view = fakeView('v1');
    const { presentation } = setupWith(view);
    view.atlasStore.setState({ mapLoaded: false });
    view.switchToTab = (): Promise<void> => Promise.resolve();
    expect(await presentation.present('v1')).toBe(false);
    load(view);
    expect(await presentation.present('v1')).toBe(true);
    presentation.stop();
    expect(presentation.current()).toBeNull();
  });

  it('removes its listener and target when the extension is disposed', () => {
    const { presentation, disposers } = setupWith(fakeView('v1'));
    const listener = vi.fn();
    presentation.subscribe({ cleared: listener });
    presentation.addTarget({ id: 'screen', label: 'the second screen', isActive: () => true });
    disposers.disposeAll();
    expect(activePresentationTarget()).toBeNull();
    const view = fakeView('v2');
    load(view);
    presentedScene.present(view as never, view.tabMetaStore.getState().activeTabId!);
    presentedScene.clear();
    expect(listener).not.toHaveBeenCalled();
  });

  it('present resolves false instead of throwing when switching the tab fails', async () => {
    const view = fakeView('v1');
    const { presentation } = setupWith(view);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    view.switchToTab = (): Promise<void> => Promise.reject(new Error('boom'));
    expect(await presentation.present('v1')).toBe(false);
    error.mockRestore();
  });

  it('cleared reports whether the scene was held', () => {
    const view = fakeView('v1');
    const { presentation } = setupWith(view);
    const seen: boolean[] = [];
    presentation.subscribe({ cleared: (scene) => seen.push(scene.held) });
    const tabId = view.tabMetaStore.getState().activeTabId!;
    presentedScene.present(view as never, tabId);
    presentedScene.clear();
    view.tabMetaStore.getState().addTab('maps/b.atlasmap', 'B');
    presentedScene.present(view as never, tabId);
    expect(presentation.current()?.held).toBe(true);
    presentedScene.clear();
    expect(seen).toEqual([false, true]);
  });

  it('C-pres-3: presentationId is stable while a presentation is held and resumed, and new for every present', async () => {
    const view = fakeView('v1');
    const { presentation } = setupWith(view);
    const heard: Array<[string, string]> = [];
    presentation.subscribe({
      presented: (scene, resumed) => heard.push([resumed ? 'resumed' : 'presented', scene.presentationId]),
      held: (scene) => heard.push(['held', scene.presentationId]),
      cleared: (scene) => heard.push(['cleared', scene.presentationId]),
    });
    const tabId = view.tabMetaStore.getState().activeTabId!;
    expect(await presentation.present('v1', tabId)).toBe(true);
    const first = presentation.current()!.presentationId;
    expect(first).toEqual(expect.any(String));
    view.tabMetaStore.getState().addTab('maps/b.atlasmap', 'B');
    expect(presentation.current()).toMatchObject({ held: true, presentationId: first });
    view.tabMetaStore.getState().setActiveTab(tabId);
    load(view);
    await Promise.resolve();
    expect(presentation.current()).toMatchObject({ held: false, presentationId: first });
    expect(heard).toEqual([['presented', first], ['held', first], ['resumed', first]]);
    // The same tab presented again is a new presentation
    expect(await presentation.present('v1', tabId)).toBe(true);
    const second = presentation.current()!.presentationId;
    expect(second).not.toBe(first);
    expect(heard.at(-1)).toEqual(['presented', second]);
    // So is one that the GM's own eye starts, which the facade did not
    presentedScene.clear();
    expect(heard.at(-1)).toEqual(['cleared', second]);
    presentedScene.present(view as never, tabId);
    expect(presentation.current()!.presentationId).not.toBe(second);
  });

  it('C-pres-3: presentationId is not repeated after a reload', () => {
    const ids = new Set<string>();
    // A reload makes a new PresentedScene (a new module instance), whose counter, if it had one, would start again.
    for (let load = 0; load < 3; load++) {
      const reloaded = new PresentedScene();
      const view = fakeView('v1');
      reloaded.present(view as never, view.tabMetaStore.getState().activeTabId!);
      ids.add(reloaded.current()!.presentationId);
    }
    expect(ids.size).toBe(3);
    for (const id of ids) expect(id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('addTarget rejects an argument that is not a target', () => {
    const { presentation } = setupWith(fakeView('v1'));
    expect(() => presentation.addTarget({ id: 'x', label: 'x' } as never)).toThrow(/presentation.addTarget: the target must be/);
    expect(() => presentation.addTarget(null as never)).toThrow(/presentation.addTarget: the target must be/);
  });

  it('addTarget keeps its own entry: fields read once, a non-empty id once per extension, and the same object twice changes nothing', () => {
    const { presentation, disposers } = setupWith(fakeView('v1'));
    let reads = 0;
    const target = { id: 'room', active: true, isActive(): boolean { return this.active; }, get label(): string { reads++; if (reads > 1) throw new Error('read again'); return 'The room'; } };
    const stop = presentation.addTarget(target);
    expect(activePresentationTarget()).toMatchObject({ id: 'room', label: 'The room' });
    expect(reads).toBe(1);
    expect(() => presentation.addTarget(target)).not.toThrow();
    expect(() => presentation.addTarget({ id: 'room', label: 'Other', isActive: () => true })).toThrow(/already added/);
    expect(() => presentation.addTarget({ id: '', label: 'Empty', isActive: () => true })).toThrow(/non-empty/);
    target.active = false;
    expect(activePresentationTarget()).toBeNull();
    stop();
    disposers.disposeAll();
  });

  it('C-badge-1: tabBadge is read once and called on the target; a throw or a badge too long is handled, a non-function refused', () => {
    const { presentation, disposers } = setupWith(fakeView('v1'));
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    let reads = 0;
    const target = {
      id: 'room', label: 'The room', isActive: (): boolean => true, players: 2, fail: false,
      get tabBadge(): (tab: { viewId: string; tabId: string }) => string | null {
        reads++;
        return function (this: { players: number; fail: boolean }, tab) {
          if (this.fail) throw new Error('boom');
          return tab.tabId === 'long' ? `${this.players} players on the far side of the map` : `${this.players} players`;
        };
      },
    };
    presentation.addTarget(target);
    expect(reads).toBe(1);
    expect(tabBadgeFor('v1', 't1')).toBe('2 players');
    expect(tabBadgeFor('v1', 'long')).toBe('2 players on the far si…');
    target.fail = true;
    expect(tabBadgeFor('v1', 't1')).toBeNull();
    expect(tabBadgeFor('v1', 't1')).toBeNull();
    expect(error).toHaveBeenCalledTimes(1);
    expect(() => presentation.addTarget({ id: 'bad', label: 'Bad', isActive: () => true, tabBadge: 'two' } as never)).toThrow('[Atlas API] presentation.addTarget: "tabBadge" must be a function when given.');
    disposers.disposeAll();
    expect(tabBadgeFor('v1', 't1')).toBeNull();
    error.mockRestore();
  });

  it('reads no tabBadge without the scene-tabs capability', () => {
    const view = fakeView('v1');
    const disposers = new DisposerSet();
    const presentation = presentationApi(trackerWith([view]).tracker, disposers, 'ext');
    presentation.addTarget({ id: 'room', label: 'The room', isActive: () => true, tabBadge: () => '2 players' });
    expect(tabBadgeFor('v1', 't1')).toBeNull();
    disposers.disposeAll();
  });
});

describe('presentation without a registered target', () => {
  beforeEach(() => {
    presentedScene.clear();
    presenter.presentTabInPlayerWindow.mockClear();
    playerWindowStore.setState({ isOpen: true });
  });

  it("presents through the player window, as Atlas's own command does, and reads what it shows", async () => {
    const view = fakeView('v1');
    const { presentation } = setupWith(view);
    const tabId = view.tabMetaStore.getState().activeTabId!;
    // The stock path presents the scene in the window, which is what the presented scene then holds.
    presenter.presentTabInPlayerWindow.mockImplementationOnce(async () => { presentedScene.present(view, tabId); });
    expect(await presentation.present('v1')).toBe(true);
    expect(presenter.presentTabInPlayerWindow).toHaveBeenCalledWith(view.app, view, tabId);
    expect(presentation.current()).toMatchObject({ viewId: 'v1', tabId, held: false });
  });
});
