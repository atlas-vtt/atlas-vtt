// @vitest-environment jsdom
import { EventEmitter } from 'events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EventSystem } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import { levelSurfaceList, MAX_LEVEL_SURFACES } from '../../../src/app/levels/levelSurfaces';
import { levelObjects } from '../../../src/app/levels/levelObjects';
import { LevelSurfaceEditor } from '../../../src/app/pixi/levelSurfaces/LevelSurfaceEditor';
import { closeStalePopovers } from '../../../src/app/pixi/lighting/popoverGuards';
import { createViewAtlasStore, type ViewAtlasStore } from '../../../src/app/storeFactory';
import { getHistoryStore } from '../../../src/app/stores/history';
import type { LevelSurface, SceneLevel } from '../../../src/app/types/sceneLevelTypes';
import { createInMemoryApp } from '../../mocks/inMemoryVault';
import { stubJsdomGraphics } from '../../mocks/jsdomGraphics';

vi.mock('../../../src/app/ui/notice', () => ({ showNotice: vi.fn() }));

const LEVELS: SceneLevel[] = [
  { id: 'ground', name: 'Ground', elevation: { bottom: 0, top: 10 }, background: null },
  { id: 'upper', name: 'Upper', elevation: { bottom: 10, top: 20 }, background: null },
];
const SQUARE = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }];

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

function sceneStore(surfaces: Record<string, LevelSurface> = {}): ViewAtlasStore {
  const { app } = createInMemoryApp();
  const store = createViewAtlasStore(app, `openings-tool-${Math.random()}`);
  store.setState({
    persistenceEnabled: false, mapLoaded: true, isMapLoading: false, isGMView: true, levels: LEVELS, viewedLevel: 'upper', activeTool: 'wall',
    objects: { ...store.getState().objects, levelSurfaces: surfaces },
  });
  getHistoryStore(store)?.getState().clear();
  return store;
}

function editorFor(store: ViewAtlasStore): { editor: LevelSurfaceEditor; bus: EventEmitter; full: ReturnType<typeof vi.fn> } {
  const restore = stubJsdomGraphics();
  const canvas = document.createElement('canvas');
  const viewport = new Viewport({ screenWidth: 800, screenHeight: 600, events: { domElement: canvas } as unknown as EventSystem });
  const bus = new EventEmitter();
  const full = vi.fn();
  const editor = new LevelSurfaceEditor({ viewport, canvas, store, eventBus: bus, onActiveChange: () => undefined, onFull: full });
  cleanups.push(() => {
    editor.destroy();
    viewport.destroy();
    restore();
  });
  return { editor, bus, full };
}

describe('the openings mode of the lighting tool', () => {
  it('draws an opening on the level shown as one undo step and opens its popover', () => {
    const store = sceneStore();
    const { editor, bus } = editorFor(store);
    bus.emit('wall-submode-changed', 'level-surface');
    expect(editor.active).toBe(true);
    for (const { x, y } of SQUARE) editor.pointerDown({ x, y }, { altKey: true });
    expect(editor.handleEnter()).toBe(true);

    const [opening] = levelSurfaceList(levelObjects(store.getState()).levelSurfaces);
    expect(opening).toMatchObject({ polygon: SQUARE, open: true, level: 'upper' });
    expect(store.getState().levelSurfacePopover).toBe(opening!.id);
    expect(getHistoryStore(store)!.getState().pastStates).toHaveLength(1);
  });

  it('takes no press outside its mode', () => {
    const store = sceneStore();
    const { editor, bus } = editorFor(store);
    bus.emit('wall-submode-changed', 'light-zone');
    expect(editor.pointerDown({ x: 10, y: 10 }, { altKey: true })).toBe(false);
  });

  it('begins no opening on a level that holds as many as it may, and says so', () => {
    const many = Object.fromEntries(Array.from({ length: MAX_LEVEL_SURFACES }, (_, i) => [`s${i}`, { id: `s${i}`, kind: 'level-surface', level: 'upper', open: true, polygon: SQUARE.map(({ x, y }) => ({ x: x + 200 * i, y })) } as LevelSurface]));
    const store = sceneStore(many);
    const { editor, bus, full } = editorFor(store);
    bus.emit('wall-submode-changed', 'level-surface');
    editor.pointerDown({ x: -500, y: -500 }, { altKey: true });
    expect(full).toHaveBeenCalledTimes(1);
  });

  it('closes the popover of an opening the view no longer shows', () => {
    const store = sceneStore({ hole: { id: 'hole', kind: 'level-surface', level: 'upper', open: true, polygon: SQUARE } });
    store.getState().openLevelSurfacePopover('hole');
    store.getState().setViewedLevel('ground');
    closeStalePopovers(store.getState());
    expect(store.getState().levelSurfacePopover).toBeNull();
  });
});
