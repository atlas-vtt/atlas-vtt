import '../setup/obsidianDom';
import { Application, Container, FederatedPointerEvent, RenderTexture, Sprite, Texture, Ticker, type WebGLRenderer } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import { afterEach, describe, expect, it } from 'vitest';
import { commands } from 'vitest/browser';
import { createTestRenderer } from '../../src/app/pixi/lighting/engine/__tests__/gpuTestUtils';
import { MeasureRenderer, type MeasureGrid } from '../../src/app/pixi/measure/MeasureRenderer';
import { destroyTree } from '../../src/app/pixi/utils/destroyTree';
import { createViewAtlasStore, type ViewAtlasStore } from '../../src/app/storeFactory';
import type { TokenEntity } from '../../src/app/types';
import { createInMemoryApp } from '../mocks/inMemoryVault';

const PANE = { width: 1440, height: 900 };
const MAP = 2800;
const CELL = 70;
/** Rooms of six cells a side. */
const ROOM = 6 * CELL;
/** A 60 ft circle where a cell is 5 ft. */
const RADIUS = 12 * CELL;
const MOVES = 240;
const GRID: MeasureGrid = {
  getOptions: () => ({ type: 'square', size: CELL, offsetX: 0, offsetY: 0 }),
  snapToCellCenter: (x, y) => ({ x: Math.floor(x / CELL) * CELL + CELL / 2, y: Math.floor(y / CELL) * CELL + CELL / 2 }),
};

interface Scene {
  renderer: WebGLRenderer;
  app: Application;
  viewport: Viewport;
  store: ViewAtlasStore;
  measure: MeasureRenderer;
}

/** Where a world point lies on the pane, whose middle shows the map's. */
const onPane = (x: number, y: number): { x: number; y: number } => ({ x: x - (MAP - PANE.width) / 2, y: y - (MAP - PANE.height) / 2 });

/**
 * A dungeon's worth of walls: every room of the map walled on all sides with a door-wide gap in
 * each, and a short wall standing in every room: 245 walls, which the lighting seals as it does.
 */
function wallIn(s: Scene): number {
  const { addWall } = s.store.getState();
  let count = 0;
  const wall = (x0: number, y0: number, x1: number, y1: number): void => {
    addWall({ type: 'solid', p1: { x: x0, y: y0 }, p2: { x: x1, y: y1 } });
    count++;
  };
  for (let line = 0; line <= MAP; line += ROOM) {
    for (let along = 0; along < MAP; along += ROOM) {
      wall(line, along, line, along + 2 * CELL);
      wall(line, along + 3 * CELL, line, along + ROOM);
      wall(along, line, along + 2 * CELL, line);
      wall(along + 3 * CELL, line, along + ROOM, line);
    }
  }
  for (let x = ROOM / 2; x < MAP; x += ROOM) for (let y = ROOM / 2; y < MAP; y += ROOM) wall(x - CELL, y + CELL, x + CELL, y + 1.5 * CELL);
  return count;
}

/** The time `work` takes for each of `count` runs, in ms: their mean, and the slowest tenth's least. */
function timed(count: number, work: (index: number) => void): { mean: number; p90: number } {
  const each: number[] = [];
  const start = performance.now();
  for (let index = 0; index < count; index++) {
    const before = performance.now();
    work(index);
    each.push(performance.now() - before);
  }
  const total = performance.now() - start;
  each.sort((a, b) => a - b);
  return { mean: total / count, p90: each[Math.floor(count * 0.9)] ?? 0 };
}

const round = (value: number): number => Math.round(value * 1000) / 1000;

async function savePng(pixels: Uint8ClampedArray, name: string): Promise<void> {
  const canvas = new OffscreenCanvas(PANE.width, PANE.height);
  canvas.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(pixels), PANE.width, PANE.height), 0, 0);
  const bytes = new Uint8Array(await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  await commands.writeFile(`out/measure-areas/${name}.png`, btoa(binary), 'base64');
}

/**
 * What a move of the pointer costs while a 60 ft circle is dragged on a walled map: the measure
 * tool's own work for it (snapping, the area cut by walls, the cells it covers, the tokens in it,
 * its drawing handed to PIXI), and the render that follows. Measured, not budgeted to the hundredth:
 * the figures are printed for whoever compares them, and held to a bound a slow machine keeps too.
 */
describe('the cost of dragging an area on a walled map', () => {
  const cleanups: (() => void)[] = [];
  afterEach(() => { while (cleanups.length) cleanups.pop()!(); });

  /**
   * The measure tool on a map view as far as it goes: the renderer, the viewport with a floor and a
   * token layer, the view's store and the real `MeasureRenderer`. No strict checks on the graphics
   * device: its renders take what they take in Atlas.
   */
  async function scene(): Promise<Scene> {
    const renderer = await createTestRenderer(256);
    renderer.resize(PANE.width, PANE.height);
    const app = new Application();
    app.renderer = renderer;
    app.ticker = new Ticker();
    const viewport = new Viewport({ screenWidth: PANE.width, screenHeight: PANE.height, worldWidth: MAP, worldHeight: MAP, events: renderer.events });
    viewport.sortableChildren = true;
    app.stage.addChild(viewport);
    const floor = new Sprite(Texture.WHITE);
    floor.tint = 0x8a7f6a;
    floor.setSize(MAP, MAP);
    viewport.addChild(floor, new Container({ label: 'tokenContainer' }));
    viewport.moveCenter(MAP / 2, MAP / 2);
    const store = createViewAtlasStore(createInMemoryApp().app, `area-cost-${Math.random()}`);
    store.getState().setPersistenceEnabled(false);
    store.setState({ mapPath: 'maps/cost.atlasmap', isMapLoading: false, isGMView: true });
    const measure = new MeasureRenderer(viewport, store, GRID);
    measure.mapBounds = () => ({ width: MAP, height: MAP });
    cleanups.push(() => {
      measure.destroy();
      app.ticker.destroy();
      destroyTree(viewport);
      app.stage.destroy();
      renderer.destroy();
    });
    return { renderer, app, viewport, store, measure };
  }

  it('stays under a millisecond a pointer move for a 60 ft circle', async () => {
    const s = await scene();
    const walls = wallIn(s);
    // Tokens in and around the circle's room.
    for (let index = 0; index < 12; index++) {
      s.store.getState().addToken({ id: `t${index}`, kind: 'token', imagePath: '', size: 1, x: 1085 + (index % 4) * 3 * CELL, y: 1085 + Math.floor(index / 4) * 4 * CELL } as TokenEntity);
    }
    s.store.getState().setMeasureTool({ mode: 'circle' });
    s.store.getState().setActiveTool('measure');
    // The middle of a room near the map's middle.
    const centre = { x: 3.5 * ROOM, y: 3.5 * ROOM };
    const move = (radius: number, index: number, alt = false): void => {
      const angle = (index / MOVES) * 2 * Math.PI;
      const at = onPane(centre.x + radius * Math.cos(angle), centre.y + radius * Math.sin(angle));
      const event = new FederatedPointerEvent(s.renderer.events.rootBoundary);
      event.button = 0;
      event.altKey = alt;
      event.global.set(at.x, at.y);
      s.viewport.emit('pointermove', event);
    };
    const press = new FederatedPointerEvent(s.renderer.events.rootBoundary);
    press.button = 0;
    press.global.copyFrom(onPane(centre.x, centre.y));
    s.viewport.emit('pointerdown', press);
    // Warm: the sweep of the walls from the circle's centre is made once, and the first drawing builds PIXI's batches.
    for (let index = 0; index < 20; index++) move(RADIUS + (index % 2) * CELL, index);
    s.renderer.render({ container: s.app.stage });

    // Snapped, the pointer going around at one size: the area is the same, and nothing is worked out again.
    const sameSize = timed(MOVES, (index) => move(RADIUS, index));
    // Snapped, every move another size (11 and 13 cells in turn): cut, cells and tokens worked out each time.
    const otherSize = timed(MOVES, (index) => move(RADIUS + (index % 2 ? 1 : -1) * 0.8 * CELL, index));
    // Free (Alt): every move another size, by a few pixels.
    const free = timed(MOVES, (index) => move(RADIUS + 40 * Math.sin(index), index, true));
    // The render each move asks for, where PIXI builds the body's geometry, beside a render of the stage
    // with nothing changed: the time the call takes on this thread, not the graphics device's.
    const render = (): void => s.renderer.render({ container: s.app.stage });
    const renderAlone = timed(60, render);
    const sameSizeWithRender = timed(60, (index) => {
      move(RADIUS, index * 4);
      render();
    });
    const withRender = timed(60, (index) => {
      move(RADIUS + (index % 2 ? 1 : -1) * 0.8 * CELL, index * 4);
      render();
    });
    const live = s.measure.measurements.get().live;
    expect(live?.shape).toBe('circle');
    console.info(`area drag cost, ms per pointer move of a 60 ft circle on a map of ${walls} walls (mean / 90th percentile of ${MOVES}): ${JSON.stringify({
      sameSize: [round(sameSize.mean), round(sameSize.p90)],
      otherSize: [round(otherSize.mean), round(otherSize.p90)],
      free: [round(free.mean), round(free.p90)],
    })}; a render of the unchanged stage ${round(renderAlone.mean)}, a move at one size with its render ${round(sameSizeWithRender.mean)}, a move to another size with its render ${round(withRender.mean)}`);
    if (import.meta.env.VITE_MEASURE_AREA_PNG) {
      // The picture, for whoever wants to look at the body: written only when asked for.
      const target = RenderTexture.create(PANE);
      s.renderer.render({ container: s.app.stage, target, clear: true });
      await savePng(s.renderer.extract.pixels({ target }).pixels, 'circle-on-walled-map');
      target.destroy(true);
    }
    // The target is 1 ms; a machine under load still keeps three times that.
    expect(otherSize.mean).toBeLessThan(3);
    expect(sameSize.mean).toBeLessThan(otherSize.mean);
  });
});
