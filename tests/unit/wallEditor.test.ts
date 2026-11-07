// @vitest-environment jsdom
import { EventEmitter } from 'events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EventSystem } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import { BUILT_IN_SYSTEM_PRESETS } from '../../src/app/gameSystems/builtInPresets';
import { GENERIC_LIGHT_PRESETS } from '../../src/app/gameSystems/lightPresets/generic';
import { lightPresetsOnMap } from '../../src/app/lighting/lightPresetChoice';
import { WallEditor } from '../../src/app/pixi/lighting/WallEditor';
import { showWallMenu } from '../../src/app/pixi/lighting/lightingMenus';
import type { ContextMenuEntry } from '../../src/app/react/root/ContextMenuContext';
import type { WallInput, WallSegment } from '../../src/app/types/wallTypes';
import type { LightPresetDefinition } from '../../src/app/types/lightPresetTypes';
import { createViewAtlasStore, type ViewAtlasStore } from '../../src/app/storeFactory';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { stubJsdomGraphics } from '../mocks/jsdomGraphics';

const openContextMenuGlobal = vi.hoisted(() => vi.fn());
vi.mock('../../src/app/react/root/ContextMenuContext', () => ({ openContextMenuGlobal }));

let cleanup: (() => void) | null = null;
afterEach(() => {
  cleanup?.();
  cleanup = null;
  openContextMenuGlobal.mockReset();
});

// The lights as a map on a 5-foot grid offers them.
const onMap = (presets: readonly LightPresetDefinition[]): LightPresetDefinition[] => lightPresetsOnMap(presets, { unitType: 'feet', ruleDistance: 5 }, Infinity);
const lights = { current: onMap(GENERIC_LIGHT_PRESETS) as readonly LightPresetDefinition[] };

function setup(): { editor: WallEditor; store: ViewAtlasStore; wall: string; bus: EventEmitter } {
  const restoreGraphics = stubJsdomGraphics();
  const events = { domElement: document.createElement('canvas') } as unknown as EventSystem;
  const viewport = new Viewport({ screenWidth: 800, screenHeight: 600, events });
  const { app } = createInMemoryApp({ files: {} });
  const store = createViewAtlasStore(app, `wall-editor-${Math.random()}`);
  store.getState().setPersistenceEnabled(false);
  store.getState().setActiveTool('wall');
  const wall = store.getState().addWall({ type: 'solid', p1: { x: 100, y: 100 }, p2: { x: 300, y: 100 }, closed: true });
  const bus = new EventEmitter();
  const editor = new WallEditor(viewport, store, bus, () => undefined, () => lights.current);
  editor.layer.visible = true;
  cleanup = () => {
    editor.destroy();
    viewport.destroy();
    restoreGraphics();
    lights.current = onMap(GENERIC_LIGHT_PRESETS);
  };
  return { editor, store, wall, bus };
}

describe('WallEditor', () => {
  it('drags a wall handle while its layer shows', () => {
    const { editor, store, wall } = setup();
    expect(editor.pointerDown({ x: 100, y: 100 }, false, false)).toBe(true);
    editor.pointerMove({ x: 140, y: 160 });
    expect(store.getState().objects.walls[wall]?.p1).toEqual({ x: 140, y: 160 });
  });

  // Whoever hides the layer ends what was under way (`afterVisibilityChange`); the editor itself
  // also takes no pointer while hidden, so a drag cannot go on unseen even before that call.
  it('moves nothing from the moment its layer is hidden', () => {
    const { editor, store, wall } = setup();
    editor.pointerDown({ x: 100, y: 100 }, false, false);
    editor.layer.visible = false;
    editor.pointerMove({ x: 140, y: 160 });
    expect(store.getState().objects.walls[wall]?.p1).toEqual({ x: 100, y: 100 });
    expect(editor.pointerDown({ x: 300, y: 100 }, false, false)).toBe(false);
    expect(editor.cursorAt({ x: 100, y: 100 })).toBe('default');
  });

  it('places the light the lighting menu chose, as the map\'s collection defines it', () => {
    const dnd5e = BUILT_IN_SYSTEM_PRESETS.find((preset) => preset.name === 'D&D 5e')!.rules.lightPresets!;
    const cairn = BUILT_IN_SYSTEM_PRESETS.find((preset) => preset.name === 'Cairn')!.rules.lightPresets!;
    const { editor, store, bus } = setup();
    const placed = (): unknown[] => Object.values(store.getState().objects.lights).map((light) => light.emission);
    lights.current = onMap(dnd5e);
    bus.emit('wall-submode-changed', 'place-light');
    editor.pointerDown({ x: 500, y: 400 }, false, false);
    expect(placed()).toMatchObject([{ bright: 20, dim: 40, kind: 'torch', preset: 'dnd5e-torch' }]);
    bus.emit('lighting-preset-changed', 'dnd5e-daylight');
    editor.pointerDown({ x: 600, y: 400 }, false, false);
    expect(placed()[1]).toMatchObject({ bright: 60, dim: 120, kind: 'magical', preset: 'dnd5e-daylight' });
    // The collection's game system changed: the light chosen before is no longer one of its lights.
    lights.current = onMap(cairn);
    editor.pointerDown({ x: 700, y: 400 }, false, false);
    expect(placed()[2]).toMatchObject({ bright: 40, dim: 40, preset: 'cairn-torch' });
  });
});

/** A click: pressed and released in place. */
function click(editor: WallEditor, point: { x: number; y: number }, alt = false): void {
  editor.pointerDown(point, false, false, alt);
  editor.pointerUp();
}

function drag(editor: WallEditor, from: { x: number; y: number }, to: { x: number; y: number }): void {
  editor.pointerDown(from, false, false);
  editor.pointerMove(to);
  editor.pointerUp();
}

function others(store: ViewAtlasStore, id: string): WallSegment[] {
  return Object.values(store.getState().objects.walls).filter((wall) => wall.id !== id);
}

describe('WallEditor joining walls', () => {
  it('starts a wall on a wall end clicked in place, joined to it, and leaves that end where it was', () => {
    const { editor, store, wall } = setup();
    click(editor, { x: 302, y: 103 });
    click(editor, { x: 300, y: 250 });
    expect(store.getState().objects.walls[wall]?.p2).toEqual({ x: 300, y: 100 });
    expect(others(store, wall)).toMatchObject([{ p1: { x: 300, y: 100 }, p2: { x: 300, y: 250 } }]);
  });

  it('ends a wall on a wall end close by, also on a wall line, and where the pointer is with Alt', () => {
    const { editor, store, wall } = setup();
    click(editor, { x: 500, y: 400 });
    click(editor, { x: 306, y: 104 });
    expect(others(store, wall)).toMatchObject([{ p1: { x: 500, y: 400 }, p2: { x: 300, y: 100 } }]);
    click(editor, { x: 500, y: 500 });
    click(editor, { x: 200, y: 100 });
    click(editor, { x: 600, y: 500 });
    click(editor, { x: 306, y: 104 }, true);
    expect(others(store, wall).map((other) => other.p2)).toEqual([{ x: 300, y: 100 }, { x: 200, y: 100 }, { x: 306, y: 104 }]);
    expect(store.getState().objects.walls[wall]?.p2).toEqual({ x: 300, y: 100 });
  });

  it('continues the chain of the wall it starts on', () => {
    const { editor, store, wall } = setup();
    const chained = store.getState().addWall({ type: 'solid', p1: { x: 500, y: 100 }, p2: { x: 600, y: 100 }, chainId: 'room', closed: true });
    click(editor, { x: 600, y: 100 });
    click(editor, { x: 600, y: 200 });
    // Where two walls meet, the new one belongs to neither chain.
    click(editor, { x: 300, y: 100 });
    click(editor, { x: 300, y: 50 });
    const added = others(store, wall).filter((other) => other.id !== chained);
    expect(added.map((other) => other.chainId)).toEqual(['room', expect.not.stringMatching(/^room$/)]);
  });

  it('lands a dragged wall end on another, and the joint then moves as one', () => {
    const { editor, store, wall } = setup();
    const other = store.getState().addWall({ type: 'solid', p1: { x: 500, y: 300 }, p2: { x: 600, y: 300 }, closed: true });
    drag(editor, { x: 300, y: 100 }, { x: 494, y: 305 });
    expect(store.getState().objects.walls[wall]?.p2).toEqual({ x: 500, y: 300 });
    drag(editor, { x: 500, y: 300 }, { x: 520, y: 330 });
    expect(store.getState().objects.walls[wall]?.p2).toEqual({ x: 520, y: 330 });
    expect(store.getState().objects.walls[other]?.p1).toEqual({ x: 520, y: 330 });
    // Never onto its own wall's far end.
    drag(editor, { x: 600, y: 300 }, { x: 523, y: 333 });
    expect(store.getState().objects.walls[other]?.p2).toEqual({ x: 523, y: 333 });
  });
});

describe('the wall menu', () => {
  function chain(store: ViewAtlasStore): string[] {
    const sides: WallInput[] = [
      { type: 'solid', p1: { x: 0, y: 0 }, p2: { x: 280, y: 0 }, chainId: 'c' },
      { type: 'solid', p1: { x: 280, y: 0 }, p2: { x: 280, y: 280 }, chainId: 'c' },
      { type: 'solid', p1: { x: 280, y: 280 }, p2: { x: 0, y: 280 }, chainId: 'c' },
    ];
    return sides.map((side) => store.getState().addWall(side));
  }

  function menu(editor: WallEditor, store: ViewAtlasStore, at: { x: number; y: number }): ContextMenuEntry[] {
    showWallMenu({ store, walls: editor.walls, doors: editor.doors, wallRenderer: editor.renderer, lightAt: () => null }, at.x, at.y, 0, 0);
    return openContextMenuGlobal.mock.calls.at(-1)![0] as ContextMenuEntry[];
  }

  function choose(entries: ContextMenuEntry[], label: string): void {
    const entry = entries.find((candidate) => candidate.type === 'item' && candidate.label === label);
    if (entry?.type !== 'item') throw new Error(`No ${label} in the menu`);
    void entry.onClick?.();
  }

  it('places a door in the wall of a chain that was right-clicked, one cell wide where it was clicked', () => {
    const { editor, store, wall } = setup();
    store.getState().deleteWall(wall);
    const [top] = chain(store);
    choose(menu(editor, store, { x: 140, y: 3 }), 'Place door');
    editor.pointerDown({ x: 140, y: 3 }, false, false);
    const walls = Object.values(store.getState().objects.walls);
    expect(walls).toHaveLength(5);
    expect(store.getState().objects.walls[top!]).toBeUndefined();
    expect(walls.find((candidate) => candidate.type === 'door')).toMatchObject({ p1: { x: 105, y: 0 }, p2: { x: 175, y: 0 }, closed: true, chainId: 'c' });
  });

  it('removes a door again, and a point between two walls', () => {
    const { editor, store, wall } = setup();
    store.getState().deleteWall(wall);
    chain(store);
    choose(menu(editor, store, { x: 140, y: 3 }), 'Place door');
    editor.pointerDown({ x: 140, y: 3 }, false, false);
    choose(menu(editor, store, { x: 140, y: 1 }), 'Remove door');
    expect(Object.values(store.getState().objects.walls).map((side) => [side.type, side.p1, side.p2])).toContainEqual(['solid', { x: 0, y: 0 }, { x: 280, y: 0 }]);
    choose(menu(editor, store, { x: 280, y: 0 }), 'Remove point');
    expect(Object.values(store.getState().objects.walls).map((side) => [side.p1, side.p2])).toEqual(expect.arrayContaining([[{ x: 0, y: 0 }, { x: 280, y: 280 }]]));
    expect(Object.values(store.getState().objects.walls)).toHaveLength(2);
  });
});
