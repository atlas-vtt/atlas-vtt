// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EventSystem } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import { levelLinkList } from '../../../src/app/levels/levelLinks';
import { LevelLinkEditor } from '../../../src/app/pixi/levelLinks/LevelLinkEditor';
import { dropTokensOnStairs } from '../../../src/app/pixi/token-renderer/stairsDrop';
import { createViewAtlasStore, type ViewAtlasStore } from '../../../src/app/storeFactory';
import { beginHistoryTransaction, getHistoryStore } from '../../../src/app/stores/history';
import type { LevelLink, SceneLevel } from '../../../src/app/types/sceneLevelTypes';
import type { TokenEntity } from '../../../src/app/types';
import type { ContextMenuEntry } from '../../../src/app/react/root/ContextMenuContext';
import { createInMemoryApp } from '../../mocks/inMemoryVault';
import { EventEmitter } from 'events';
import type { App } from 'obsidian';
import { onLeavingView } from '../../../src/app/pixi/viewLeaving';
import { stubJsdomGraphics } from '../../mocks/jsdomGraphics';

const menus = vi.hoisted(() => ({ opened: [] as { entries: ContextMenuEntry[]; onClose?: (() => void) | undefined }[] }));
vi.mock('../../../src/app/react/root/ContextMenuContext', () => ({
  openContextMenuGlobal: (entries: ContextMenuEntry[], _at: unknown, options?: { onClose?: () => void }) => {
    menus.opened.push({ entries, onClose: options?.onClose });
    return true;
  },
}));
vi.mock('../../../src/app/ui/notice', () => ({ showNotice: vi.fn() }));

const LEVELS: SceneLevel[] = [
  { id: 'ground', name: 'Ground', elevation: { bottom: 0, top: 10 }, background: null },
  { id: 'upper', name: 'Upper', elevation: { bottom: 10, top: 20 }, background: null },
  { id: 'roof', name: 'Roof', elevation: { bottom: 20, top: 30 }, background: null },
];
const SQUARE = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }];
const token = (id: string, level = 'ground'): TokenEntity => ({ id, kind: 'token', x: 500, y: 500, imagePath: `${id}.png`, level });

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  menus.opened.length = 0;
});

function sceneStore(links: Record<string, LevelLink> = {}, tokens: Record<string, TokenEntity> = {}): ViewAtlasStore {
  const { app } = createInMemoryApp();
  const store = createViewAtlasStore(app, `stairs-tool-${Math.random()}`);
  store.setState({
    persistenceEnabled: false, mapLoaded: true, isMapLoading: false, isGMView: true, levels: LEVELS, viewedLevel: 'ground',
    objects: { ...store.getState().objects, tokens, levelLinks: links },
  });
  getHistoryStore(store)?.getState().clear();
  return store;
}

function editorFor(store: ViewAtlasStore, { destroyedByTest = false } = {}): LevelLinkEditor {
  const restore = stubJsdomGraphics();
  const canvas = document.createElement('canvas');
  const viewport = new Viewport({ screenWidth: 800, screenHeight: 600, events: { domElement: canvas } as unknown as EventSystem });
  const full = vi.fn();
  const editor = new LevelLinkEditor({ viewport, canvas, store, onFull: full });
  cleanups.push(() => {
    if (!destroyedByTest) editor.destroy();
    viewport.destroy();
    restore();
  });
  return editor;
}

describe('the stairs tool', () => {
  it('draws stairs on the level shown that lead to the level above, as one undo step, and opens their popover', () => {
    const store = sceneStore();
    const editor = editorFor(store);
    store.getState().setActiveTool('stairs');
    expect(editor.active).toBe(true);
    for (const [x, y] of [[0, 0], [100, 0], [100, 100], [0, 100]] as const) editor.pointerDown({ x, y }, { altKey: true });
    expect(editor.handleEnter()).toBe(true);

    const [stairs] = levelLinkList(store.getState().objects.levelLinks);
    expect(stairs).toMatchObject({ polygon: SQUARE, levels: ['ground', 'upper'] });
    expect(store.getState().levelLinkPopover).toBe(stairs!.id);
    expect(getHistoryStore(store)!.getState().pastStates).toHaveLength(1);
  });

  it('shows the stairs to the GM at rest, and never in a scene of one level or the players\' view', () => {
    const store = sceneStore({ stairs: { id: 'stairs', kind: 'level-link', polygon: SQUARE, levels: ['ground', 'upper'] } });
    const editor = editorFor(store);
    expect(editor.view.visible).toBe(true);
    expect(editor.active).toBe(false);
    store.getState().setGMView(false);
    expect(editor.view.visible).toBe(false);
    store.getState().setGMView(true);
    store.setState({ levels: undefined });
    expect(editor.view.visible).toBe(false);
  });

  it('gives way to moving when the scene loses its levels, and closes a popover the GM can no longer use', () => {
    const store = sceneStore({ stairs: { id: 'stairs', kind: 'level-link', polygon: SQUARE, levels: ['ground', 'upper'] } });
    editorFor(store);
    store.getState().setActiveTool('stairs');
    store.getState().openLevelLinkPopover('stairs');
    store.getState().setViewedLevel('roof');
    expect(store.getState().levelLinkPopover).toBeNull();
    store.setState({ levels: undefined });
    expect(store.getState().activeTool).toBe('move');
  });
});

describe('walked stairs in the stairs tool', () => {
  it('keep their foot when a corner is dragged, and count their rows again from the grid, in the drag\'s one undo step', () => {
    const flight = { foot: 2, rows: 2 };
    const store = sceneStore({ stairs: { id: 'stairs', kind: 'level-link', polygon: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 200 }, { x: 0, y: 200 }], levels: ['ground', 'upper'], flight } });
    store.setState({ grid: { ...store.getState().grid!, size: 100 } });
    getHistoryStore(store)!.getState().clear();
    const editor = editorFor(store);
    store.getState().setActiveTool('stairs');
    editor.pointerDown({ x: 100, y: 200 }, { altKey: true });
    editor.pointerMove({ x: 100, y: 300 }, { altKey: true });
    editor.pointerMove({ x: 100, y: 400 }, { altKey: true });
    editor.pointerUp();
    const [stairs] = levelLinkList(store.getState().objects.levelLinks);
    // The middle of the foot moved from y 200 to y 300: three rows from the head's middle at y 0.
    expect(stairs!.flight).toEqual({ foot: 2, rows: 3 });
    expect(getHistoryStore(store)!.getState().pastStates).toHaveLength(1);
    getHistoryStore(store)!.getState().undo();
    expect(levelLinkList(store.getState().objects.levelLinks)[0]!.flight).toEqual(flight);
  });
});

describe('the stairs popover', () => {
  function openStairs(destroyedByTest = false): { store: ViewAtlasStore; editor: LevelLinkEditor } {
    const store = sceneStore({ stairs: { id: 'stairs', kind: 'level-link', polygon: SQUARE, levels: ['ground', 'upper'] } });
    const editor = editorFor(store, { destroyedByTest });
    store.getState().setActiveTool('stairs');
    store.getState().openLevelLinkPopover('stairs');
    return { store, editor };
  }

  it('closes when its view unloads its scene or another Obsidian tab comes to the front by a key', () => {
    const { store, editor } = openStairs();
    const eventBus = new EventEmitter();
    let leafChange: ((leaf: unknown) => void) | undefined;
    const viewLeaf = { view: { viewId: 'view' } };
    const workspace = {
      on: (_event: string, handler: (leaf: unknown) => void) => {
        leafChange = handler;
        return handler;
      },
      offref: vi.fn(),
      getLeavesOfType: (type: string) => (type === 'atlas-vtt' ? [viewLeaf] : []),
    };
    const stop = onLeavingView({ eventBus, obsApp: { workspace } as unknown as App, viewId: 'view' }, () => editor.stop());

    leafChange!(viewLeaf);
    expect(store.getState().levelLinkPopover).toBe('stairs');
    leafChange!({ view: {} });
    expect(store.getState().levelLinkPopover).toBeNull();

    store.getState().openLevelLinkPopover('stairs');
    eventBus.emit('map-unloading');
    expect(store.getState().levelLinkPopover).toBeNull();
    stop();
    expect(eventBus.listenerCount('map-unloading')).toBe(0);
    expect(workspace.offref).toHaveBeenCalledOnce();
  });

  it('closes when another scene loads, and when its editor goes with the renderer', () => {
    const { store, editor } = openStairs(true);
    store.getState().setMapLoading(true, 0, 'Loading');
    expect(store.getState().levelLinkPopover).toBeNull();

    store.getState().setMapLoading(false);
    store.getState().openLevelLinkPopover('stairs');
    editor.destroy();
    expect(store.getState().levelLinkPopover).toBeNull();
  });
});

describe('a drop into an elevator', () => {
  it('asks the GM where to, and the pick joins the drop in one undo step', () => {
    const store = sceneStore({ lift: { id: 'lift', kind: 'level-link', polygon: SQUARE, levels: 'all' } }, { knight: token('knight'), mage: token('mage') });
    store.getState().setSelection(['knight', 'mage']);
    beginHistoryTransaction(store);
    const held = dropTokensOnStairs(store, [{ id: 'knight', x: 50, y: 50 }, { id: 'mage', x: 60, y: 60 }], { x: 10, y: 10 });

    expect(held).toBe(true);
    const [menu] = menus.opened;
    expect(menu!.entries.map((entry) => (entry.type === 'item' ? entry.label : ''))).toEqual(['Up to Roof', 'Up to Upper', 'Stay on Ground']);
    const roof = menu!.entries[0]!;
    if (roof.type === 'item') roof.onClick();
    menu!.onClose?.();

    expect(store.getState().objects.tokens.knight!.level).toBe('roof');
    expect(store.getState().objects.tokens.mage!.level).toBe('roof');
    // Two tokens selected: the view stays where it was.
    expect(store.getState().viewedLevel).toBe('ground');
    const history = getHistoryStore(store)!.getState();
    expect(history.pastStates).toHaveLength(1);
    history.undo();
    expect(store.getState().objects.tokens.knight).toMatchObject({ x: 500, y: 500, level: 'ground' });
  });

  it('follows the one token selected to its level', () => {
    const store = sceneStore({ stairs: { id: 'stairs', kind: 'level-link', polygon: SQUARE, levels: ['ground', 'upper'] } }, { knight: token('knight') });
    store.getState().setSelection(['knight']);
    beginHistoryTransaction(store);

    expect(dropTokensOnStairs(store, [{ id: 'knight', x: 50, y: 50 }], { x: 10, y: 10 })).toBe(false);

    expect(store.getState().viewedLevel).toBe('upper');
    expect(store.getState().selectedIds).toEqual(['knight']);
    expect(menus.opened).toHaveLength(0);
  });

  it('asks nothing when the pointer was lost: the tokens stay on their level', () => {
    const store = sceneStore({ lift: { id: 'lift', kind: 'level-link', polygon: SQUARE, levels: 'all' } }, { knight: token('knight') });
    beginHistoryTransaction(store);
    expect(dropTokensOnStairs(store, [{ id: 'knight', x: 50, y: 50 }], null)).toBe(false);
    expect(store.getState().objects.tokens.knight!.level).toBe('ground');
  });
});
