import type { GmMessage, PlayerDrag, PlayerMove } from '../../../../src/app/online/protocol/index.ts';
import type { WorkspaceLeaf } from 'obsidian';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getHistoryStore, runUntracked } from '../../../../src/app/stores/history';
import type { SceneState, SceneStore } from '../../../../src/app/online/gm/atlasView.ts';
import { PlayerMoves } from '../../../../src/app/online/gm/playerMoves.ts';
import type { PresentedTab, TabSource } from '../../../../src/app/online/gm/presentedScene.ts';
import { PresentedStore } from '../../../../src/app/online/gm/presentedStore.ts';
import { ALIAS, ANA, SCENE, STORE_FACTORY, type StoreFactory } from './realStore.ts';
import { token } from './shareHarness.ts';

const { createViewAtlasStore } = (await import(/* @vite-ignore */ STORE_FACTORY)) as { createViewAtlasStore: StoreFactory };

const CAVE = 'Scenes/Cave.atlasmap';
const HALL = 'Scenes/Hall.atlasmap';

/** A view's scene tabs, Cave and Hall, as Atlas's tab store keeps them. */
function sceneTabs(): TabSource & { activate(id: string): void } {
  let state = { tabs: [{ id: 'cave', filePath: CAVE, displayName: 'Cave', isLoaded: true, isDirty: false }, { id: 'hall', filePath: HALL, displayName: 'Hall', isLoaded: false, isDirty: false }], activeTabId: 'cave' as string | null };
  const listeners = new Set<() => void>();
  return {
    getState: () => state,
    subscribe: (listener) => (listeners.add(listener), () => void listeners.delete(listener)),
    activate: (id) => {
      state = { ...state, activeTabId: id };
      for (const listener of listeners) listener();
    },
  };
}

/** A real Atlas view store with the Cave loaded (Ana's ogre in it), its tabs, and the Cave presented. */
function view(): { store: ReturnType<StoreFactory>; tabs: ReturnType<typeof sceneTabs>; presented: PresentedTab } {
  const store = createViewAtlasStore({}, 'presented-store-test');
  store.getState().setPersistenceEnabled(false);
  runUntracked(store, () => store.setState((draft) => {
    draft.mapLoaded = true;
    (draft as unknown as SceneState).mapPath = CAVE;
    draft.objects.tokens = { ogre: token('ogre', { x: 105, y: 105, layer: 0 }) };
  }));
  getHistoryStore(store)?.getState().clear();
  const tabs = sceneTabs();
  return { store, tabs, presented: { leaf: {} as WorkspaceLeaf, tabs, tabId: 'cave', filePath: CAVE, name: 'Cave' } };
}

/** Atlas switching the view to the Hall tab: the tab first, then the store loads the Hall's scene. */
function switchToHall({ store, tabs }: ReturnType<typeof view>): void {
  tabs.activate('hall');
  runUntracked(store, () => store.setState((draft) => {
    draft.isMapLoading = true;
    draft.mapLoaded = false;
  }));
  runUntracked(store, () => store.setState((draft) => {
    (draft as unknown as SceneState).mapPath = HALL;
    draft.objects.tokens = { goblin: token('goblin', { x: 700, y: 700 }) };
    draft.isMapLoading = false;
    draft.mapLoaded = true;
  }));
}

/** And back to the Cave, as saved. */
function switchToCave({ store, tabs }: ReturnType<typeof view>): void {
  tabs.activate('cave');
  runUntracked(store, () => store.setState((draft) => {
    (draft as unknown as SceneState).mapPath = CAVE;
    draft.objects.tokens = { ogre: token('ogre', { x: 105, y: 105, layer: 0 }) };
  }));
}

describe('the shared store while the GM works on another scene tab', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('holds the presented scene as last shown, marked loading, takes no writes and tells nothing until the scene is shown again', () => {
    const v = view();
    const gate = new PresentedStore(v.store as unknown as SceneStore, v.presented, () => undefined);
    const heard: SceneState[] = [];
    gate.subscribe((state) => heard.push(state));

    switchToHall(v);
    expect(gate.held).toBe(true);
    // One word as the hold begins, then nothing of the Hall.
    expect(heard).toHaveLength(1);
    expect(heard[0]).toMatchObject({ mapPath: CAVE, isMapLoading: true });
    expect(gate.getState()).toMatchObject({ mapPath: CAVE, isMapLoading: true });
    expect(Object.keys(gate.getState().objects.tokens)).toEqual(['ogre']);
    gate.setState((draft) => {
      draft.objects.tokens = {};
    });
    expect(Object.keys(v.store.getState().objects.tokens)).toEqual(['goblin']);

    // The presented tab is back and loaded: live again.
    switchToCave(v);
    expect(gate.held).toBe(false);
    expect(heard.at(-1)).toMatchObject({ mapPath: CAVE, isMapLoading: false });
    expect(gate.getState()).toBe(v.store.getState());
    gate.dispose();
  });

  it('follows what Atlas presents: another tab of the view goes live once it is shown, and none holds', () => {
    const v = view();
    const gate = new PresentedStore(v.store as unknown as SceneStore, v.presented, () => undefined);
    switchToHall(v);
    expect(gate.held).toBe(true);
    gate.present({ ...v.presented, tabId: 'hall', filePath: HALL, name: 'Hall' });
    expect(gate.held).toBe(false);
    expect(gate.getState().mapPath).toBe(HALL);
    gate.present(null);
    expect(gate.held).toBe(true);
    expect(gate.getState()).toMatchObject({ mapPath: HALL, isMapLoading: true });
    gate.dispose();
  });

  it('ends a player\'s drag on the presented scene as one undo step, and refuses moves while it holds', () => {
    const v = view();
    const holds: number[] = [];
    const gate = new PresentedStore(v.store as unknown as SceneStore, v.presented, () => void holds.push(Object.keys(v.store.getState().heldTokens).length));
    const sent: { body: GmMessage; to: string }[] = [];
    const moves = new PlayerMoves(gate, {
      context: () => ({ scene: SCENE, listedToken: (alias) => (alias === ALIAS.ogre ? 'ogre' : undefined), ownerOf: () => ANA, map: { width: 2000, height: 1500 }, walls: null }),
      send: (body, to) => sent.push({ body, to }),
      now: () => Date.now(),
      setTimer: (run, ms) => setTimeout(run, ms) as unknown as number,
      clearTimer: (timer) => clearTimeout(timer),
    });
    moves.start();
    const drag: PlayerDrag = { t: 'drag', scene: SCENE, id: ALIAS.ogre, x: 300, y: 200 };
    moves.drag(ANA, drag);
    expect(v.store.getState().objects.tokens.ogre?.x).toBe(300);

    // The GM switches tabs mid-drag: the hold begins while the store still holds the Cave, the drag ends there.
    v.tabs.activate('hall');
    expect(holds).toEqual([1]);
    expect(v.store.getState().heldTokens).toEqual({});
    // Its transaction closed with the drag's step, on the Cave.
    const history = getHistoryStore(v.store);
    expect(history?.getState().pastStates).toHaveLength(1);

    switchToHall(v);
    const move: PlayerMove = { t: 'move', scene: SCENE, id: ALIAS.ogre, x: 900, y: 900 };
    moves.receive(ANA, move);
    moves.drag(ANA, { ...drag, x: 800 });
    expect(Object.keys(v.store.getState().objects.tokens)).toEqual(['goblin']);
    expect(history?.getState().pastStates).toHaveLength(1);
    // Refused with the place players see in the held picture.
    expect(sent.at(-1)).toEqual({ to: ANA, body: { t: 'move-refused', scene: SCENE, id: ALIAS.ogre, x: 300, y: 200 } });
    moves.stop();
    gate.dispose();
  });
});
