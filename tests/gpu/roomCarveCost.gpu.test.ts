import '../setup/obsidianDom';
import type { EventEmitter as NodeEventEmitter } from 'events';
import { EventEmitter, type Application } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MeasurementSettings } from '../../src/app/grid/measurementFormat';
import { levelObjects } from '../../src/app/levels/levelObjects';
import { strokePolygons } from '../../src/app/lighting/exploredEdits';
import { areaOf } from '../../src/app/lighting/rooms';
import { carvedWalls } from '../../src/app/lighting/wallCarving';
import { floorOf } from '../../src/app/lighting/wallSpaces';
import { LightingRenderer } from '../../src/app/pixi/lighting/LightingRenderer';
import { RoomEditor } from '../../src/app/pixi/lighting/RoomEditor';
import { createTestRenderer } from '../../src/app/pixi/lighting/engine/__tests__/gpuTestUtils';
import { WallRenderer } from '../../src/app/pixi/vision/WallRenderer';
import { createViewAtlasStore } from '../../src/app/storeFactory';
import { runHistoryTransaction } from '../../src/app/stores/history';
import type { TokenEntity } from '../../src/app/types';
import { wallList } from '../../src/app/vision/wallList';
import { cave, seeded } from '../helpers/carvedCaves';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { carvedWalls as carvedBefore } from '../oracles/roomCarvingBaseline/wallCarving';
import { floorOf as floorBefore } from '../oracles/roomCarvingBaseline/wallSpaces';

const MAP = 3500;
const TORCH = { bright: 20, dim: 40, color: '#ffb347', intensity: 1, animation: 'none' as const };
const HERO = { id: 'hero', kind: 'token', imagePath: 'h.png', x: 1750, y: 1750, vision: { enabled: true, range: 60 } } as TokenEntity;

/**
 * What a brush stroke in the rooms mode costs on a cave of 3,500 walls, in a lit scene with the
 * wall overlay shown: the edit worked out, written to the store, followed by everything that
 * follows the walls (lighting, the wall overlay, the darkened rock) and one render. Beside it, the
 * same stroke as edits were made before: worked out against every wall of the map and written
 * wall by wall. Measured, not budgeted: the figures are printed for whoever compares them.
 */
describe('the cost of a carve on a cave of 3,500 walls', () => {
  const cleanup: (() => void)[] = [];
  afterEach(() => {
    while (cleanup.length) cleanup.pop()!();
    vi.useRealTimers();
  });

  it('measures a brush stroke, written once and written wall by wall', { timeout: 600_000 }, async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const renderer = await createTestRenderer(1024);
    const store = createViewAtlasStore(createInMemoryApp().app, `carve-cost-${Math.random()}`);
    store.setState({ persistenceEnabled: false, mapPath: 'maps/cave.atlasmap' });
    store.getState().setActiveTool('wall');
    store.getState().editWalls([], cave(7, 3500, MAP, carvedWalls, floorOf).map(({ id: _id, kind: _kind, ...wall }) => wall));
    const random = seeded(5);
    for (let lamp = 0; lamp < 6; lamp++) store.getState().addLight({ x: random() * MAP, y: random() * MAP, emission: TORCH });
    store.setState((state) => ({ objects: { ...state.objects, tokens: { hero: HERO } } }));
    store.getState().setSceneLighting({ enabled: true, ambient: 0.3 });

    const viewport = new Viewport({ screenWidth: 1024, screenHeight: 1024, events: renderer.events });
    viewport.setZoom(1024 / MAP).moveCenter(MAP / 2, MAP / 2);
    const ticks: (() => void)[] = [];
    const lighting = new LightingRenderer({
      viewport,
      app: { renderer, ticker: { add: (tick: () => void) => ticks.push(tick), remove: vi.fn() } } as unknown as Application,
      store,
      measurement: () => ({ unitDistance: 5 }) as unknown as MeasurementSettings,
      bounds: () => ({ width: MAP, height: MAP }),
      albedo: () => null,
    });
    const wallOverlay = new WallRenderer(viewport, store);
    wallOverlay.getContainer().visible = true;
    wallOverlay.forceRedraw();
    // The browser has no Node event bus; PIXI's has the same `on`, `off` and `emit`.
    const bus = new EventEmitter();
    const editor = new RoomEditor({ viewport, store, eventBus: bus as unknown as NodeEventEmitter, bounds: () => ({ width: MAP, height: MAP }), onActiveChange: () => undefined, canvas: renderer.canvas });
    bus.emit('wall-submode-changed', 'rooms');
    editor.view.visible = true;
    editor.afterVisibilityChange();
    cleanup.push(() => {
      editor.destroy();
      wallOverlay.destroy();
      lighting.destroy();
      viewport.destroy({ children: true });
      renderer.destroy();
    });
    const frame = (): void => {
      ticks.forEach((tick) => tick());
      renderer.render({ container: viewport });
      renderer.gl.finish();
    };
    frame();
    store.temporal.getState().clear();

    // One stroke of the brush through the cave's middle, drawn as the pointer draws it.
    const path = Array.from({ length: 26 }, (_, step) => ({ x: 1200 + step * 42, y: 1700 + Math.sin(step / 3) * 160 }));
    let writes = 0;
    const stop = store.subscribe((state, previous) => {
      if (levelObjects(state).walls !== levelObjects(previous).walls) writes++;
    });
    cleanup.push(stop);
    const count = (): number => Object.keys(levelObjects(store.getState()).walls).length;
    const before = count();

    store.getState().setRoomTool({ action: 'carve', shape: 'brush', brushSize: 50 });
    editor.pointerDown(path[0]!, { altKey: false });
    for (const point of path.slice(1)) editor.pointerMove(point, { altKey: false });
    let started = performance.now();
    editor.pointerUp();
    const edited = performance.now() - started;
    frame();
    const now = performance.now() - started;
    const [writesNow, added] = [writes, count() - before];
    // Parts of it, each once more by itself: the floor of the new walls, and the wall overlay drawn anew.
    started = performance.now();
    floorOf([...wallList(levelObjects(store.getState()).walls)]);
    const floor = performance.now() - started;
    started = performance.now();
    wallOverlay.forceRedraw();
    const overlay = performance.now() - started;
    store.temporal.getState().undo();
    frame();
    expect(count()).toBe(before);

    // The same stroke as it was made before: every wall of the map looked at, then a write per wall.
    const record = levelObjects(store.getState()).walls;
    const walls = wallList(record);
    editor.pointerDown(path[0]!, { altKey: false });
    for (const point of path.slice(1)) editor.pointerMove(point, { altKey: false });
    editor.stop();
    const area = areaOf(strokePolygons({ type: 'brush', points: path, brushRadius: 50 }));
    writes = 0;
    started = performance.now();
    const edit = carvedBefore(area, walls, floorBefore(walls), 'before');
    const worked = performance.now() - started;
    runHistoryTransaction(store, () => {
      if (edit.remove.length > 0) store.getState().deleteWalls(edit.remove);
      for (const wall of edit.add) store.getState().addWall(wall);
    });
    const written = performance.now() - started - worked;
    floorBefore(wallList(levelObjects(store.getState()).walls));
    frame();
    const then = performance.now() - started;

    console.info(`carve cost on ${before} walls, ms: ${JSON.stringify({ now: Math.round(now), nowEdited: Math.round(edited), nowFloor: Math.round(floor), nowWallOverlay: Math.round(overlay), wallWritesNow: writesNow, wallsAdded: added, before: Math.round(then), beforeWorkedOut: Math.round(worked), beforeWritten: Math.round(written), wallWritesBefore: writes })}`);
    expect(writesNow).toBe(1);
    expect(added).not.toBe(0);
  });
});
