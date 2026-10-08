import { describe, expect, it, vi } from 'vitest';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { RemoteSceneApplier } from '../../src/app/remote-view/RemoteSceneApplier';
import { createViewAtlasStore } from '../../src/app/storeFactory';
import { getHistoryStore } from '../../src/app/stores/history';
import { checkedScene } from '../../src/app/remote-view/remoteInput';
import { remoteScene, remoteToken } from './remoteSceneFixtures';

let count = 0;

function setup() {
  const { app } = createInMemoryApp();
  const viewId = `remote-${count++}`;
  const store = createViewAtlasStore(app, viewId, undefined, false, { remote: true });
  return { store, applier: new RemoteSceneApplier(store, `remote:${viewId}`), viewId };
}

describe('RemoteSceneApplier', () => {
  it('writes the scene into the store, loaded under its remote map path, and opens the initiative list only with combatants', () => {
    const { store, applier, viewId } = setup();
    applier.apply(remoteScene());
    const state = store.getState();
    expect(state.mapPath).toBe(`remote:${viewId}`);
    expect(state.mapLoaded).toBe(true);
    expect(Object.keys(state.objects.tokens)).toEqual(['t1']);
    expect(state.objects.texts.x1?.text).toBe('Tavern');
    expect(state.initiativeTrackerOpen).toBe(false);
    const initiative = { ...remoteScene().initiative, entries: [{ id: 'e1', tokenId: 't1', name: 'A', initiative: 12, order: 0 }] };
    applier.apply(remoteScene({ initiative } as never));
    expect(store.getState().initiativeTrackerOpen).toBe(true);
  });

  it('keeps records handed again as the same objects, so renderers redraw only what changed', () => {
    const { store, applier } = setup();
    const scene = remoteScene({ objects: { tokens: { t1: remoteToken('t1'), t2: remoteToken('t2', { x: 300 }) }, texts: {}, drawings: {}, fog: {} } });
    applier.apply(scene);
    const before = store.getState();
    applier.apply({ ...scene, objects: { ...scene.objects, tokens: { ...scene.objects.tokens, t2: remoteToken('t2', { x: 370 }) } } });
    const after = store.getState();
    expect(after.objects.tokens.t1).toBe(before.objects.tokens.t1);
    expect(after.objects.tokens.t2?.x).toBe(370);
    expect(after.objects.fog).toBe(before.objects.fog);
    expect(after.objects.pins).toBe(before.objects.pins);
    expect(after.grid).toBe(before.grid);
    expect(after.widgetSettings).toBe(before.widgetSettings);
    expect(after.initiative).toBe(before.initiative);
  });

  it('copies what it is handed: the caller changing its objects later changes nothing in the store', () => {
    const { store, applier } = setup();
    const scene = remoteScene();
    applier.apply(scene);
    (scene.objects.tokens.t1 as { x: number }).x = 999;
    expect(store.getState().objects.tokens.t1?.x).toBe(100);
    expect(Object.isFrozen(store.getState().objects.tokens.t1)).toBe(true);
  });

  it('writes nothing when nothing changed', () => {
    const { store, applier } = setup();
    const scene = remoteScene();
    applier.apply(scene);
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    applier.apply(scene);
    applier.refresh();
    unsubscribe();
    expect(listener).not.toHaveBeenCalled();
  });

  it('shows a token image and the map by URL, rebuilding only the token whose URL changed', () => {
    const { store, applier } = setup();
    const scene = remoteScene({ objects: { tokens: { t1: remoteToken('t1'), t2: remoteToken('t2') }, texts: {}, drawings: {}, fog: {} } });
    applier.apply(scene);
    const before = store.getState();
    applier.apply({ ...scene, tokenImages: { t1: 'blob:app://obsidian.md/token-a' }, background: { ...scene.background, url: 'blob:app://obsidian.md/map' } });
    const after = store.getState();
    expect(before.objects.tokens.t1?.imagePath).toBe('');
    expect(after.objects.tokens.t1?.imagePath).toBe('blob:app://obsidian.md/token-a');
    expect(after.objects.tokens.t2).toBe(before.objects.tokens.t2);
    expect(after.background).toBe('blob:app://obsidian.md/map');
  });

  it('clears the map and unloads it when there is no scene', () => {
    const { store, applier } = setup();
    applier.apply(remoteScene());
    applier.apply(null);
    const state = store.getState();
    expect(state.mapPath).toBeNull();
    expect(state.mapLoaded).toBe(false);
    expect(state.objects.tokens).toEqual({});
    expect(state.objects.fog).toEqual({});
    expect(state.background).toBeNull();
    expect(state.initiativeTrackerOpen).toBe(false);
    expect(state.widgetSettings.widgets).toEqual({});
  });

  it('gives a scene without a grid a hidden one that snaps nothing', () => {
    const { store, applier } = setup();
    applier.apply(remoteScene({ grid: null }));
    expect(store.getState().grid).toMatchObject({ visible: false, snapToGrid: false });
  });

  it('records no undo step', () => {
    const { store, applier } = setup();
    applier.apply(remoteScene());
    applier.apply(remoteScene({ objects: { tokens: {}, texts: {}, drawings: {}, fog: {} } }));
    expect(getHistoryStore(store)?.getState().pastStates).toHaveLength(0);
  });

  it("drops a token's links into a vault: the view never reads the player's own notes by them", () => {
    const { store, applier } = setup();
    const linked = { ...remoteToken('t1'), kind: 'character', name: 'Ogre', notePath: 'notes/ogre.md', statblockPath: 'bestiary/ogre.md' } as never;
    applier.apply(remoteScene({ objects: { tokens: { t1: linked }, texts: {}, drawings: {}, fog: {} } }));
    const token = store.getState().objects.tokens.t1 as Record<string, unknown>;
    expect(token.name).toBe('Ogre');
    expect(token).not.toHaveProperty('notePath');
    expect(token).not.toHaveProperty('statblockPath');
  });

  it("drops every token's and combatant's links into a vault, whatever its kind, and shows an avatar only from an image URL", () => {
    const { store, applier } = setup();
    const linked = { ...remoteToken('t1'), notePath: 'notes/ogre.md', statblockPath: 'bestiary/ogre.md' } as never;
    const entry = (id: string, imagePath: string): Record<string, unknown> => ({ id, tokenId: 't1', name: id, initiative: 1, order: 0, imagePath, statblockPath: 'bestiary/ogre.md' });
    const initiative = { ...remoteScene().initiative, entries: [entry('vault', 'Art/ogre.png'), entry('url', 'blob:app://x')] };
    applier.apply(remoteScene({ objects: { tokens: { t1: linked }, texts: {}, drawings: {}, fog: {} }, initiative } as never));
    const state = store.getState();
    expect(state.objects.tokens.t1).not.toHaveProperty('notePath');
    expect(state.objects.tokens.t1).not.toHaveProperty('statblockPath');
    expect(state.initiative.entries.map((shown) => shown.imagePath)).toEqual(['', 'blob:app://x']);
    expect(state.initiative.entries.every((shown) => !('statblockPath' in shown))).toBe(true);
  });

  it('reads the scene once: neither a getter nor a later change of the given objects reaches the store, also when the scene is written again', () => {
    const { store, applier } = setup();
    const scene = remoteScene() as unknown as Record<string, unknown>;
    let reads = 0;
    const sizes = [{ url: null, width: 1000, height: 800 }, { url: null, width: 1e12, height: 1e12 }];
    Object.defineProperty(scene, 'background', { get: () => sizes[Math.min(reads++, 1)], enumerable: true });
    const taken = checkedScene(scene)!;
    applier.apply(taken);
    (scene.objects as { tokens: Record<string, unknown> }).tokens.t9 = remoteToken('t9');
    applier.refresh();
    expect(reads).toBe(1);
    expect(taken.background.width).toBe(1000);
    expect(Object.keys(store.getState().objects.tokens)).toEqual(['t1']);
  });

  it('refuses a scene whose records cannot be copied, keeping the scene shown, and writes that scene again without throwing', () => {
    const { store, applier } = setup();
    applier.apply(checkedScene(remoteScene())!);
    const shown = store.getState().objects.tokens;
    for (const bad of [{ ...remoteToken('t2'), notes: (): void => undefined }, { ...remoteToken('t2'), cells: new Uint8Array([1, 2]) }]) {
      const scene = remoteScene({ objects: { tokens: { t1: remoteToken('t1'), t2: bad as never }, texts: {}, drawings: {}, fog: {} } });
      expect(() => applier.apply(checkedScene(scene)!)).toThrow();
      expect(store.getState().objects.tokens).toBe(shown);
      expect(() => applier.refresh()).not.toThrow();
    }
  });

  it('keeps the grid shown while the one handed again is equal by value, so the grid is not drawn again', () => {
    const { store, applier } = setup();
    applier.apply(checkedScene(remoteScene())!);
    const grid = store.getState().grid;
    applier.apply(checkedScene(remoteScene())!);
    expect(store.getState().grid).toBe(grid);
  });
});
