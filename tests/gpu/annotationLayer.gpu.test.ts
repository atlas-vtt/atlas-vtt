import '../setup/obsidianDom';
import { Application, EventBoundary, FederatedPointerEvent, RenderTexture, Sprite, Texture } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_CELL, type DrawToolChoices } from '../../src/app/annotations/annotationTypes';
import { eraserRadius } from '../../src/app/annotations/drawSizes';
import { segmentDistanceSq } from '../../src/app/annotations/lineMath';
import { LIGHTING_QUALITY } from '../../src/app/lighting/lightingQuality';
import { AnnotationsRenderer } from '../../src/app/pixi/annotations/AnnotationsRenderer';
import { MAP_LAYER_Z } from '../../src/app/pixi/mapLayerOrder';
import { RenderScheduler } from '../../src/app/pixi/RenderScheduler';
import { captureWithLayerVisibility, type LayerVisibility } from '../../src/app/pixi/playerSafeFrame';
import { createViewAtlasStore, type ViewAtlasStore } from '../../src/app/storeFactory';
import type { DrawingStroke } from '../../src/app/types';
import { openLitView } from '../helpers/litView';
import { createInMemoryApp } from '../mocks/inMemoryVault';

vi.mock('events', async () => import('eventemitter3'));

const WIDTH = 400;
const HEIGHT = 300;

type Rgb = [number, number, number];

interface Scene {
  app: Application;
  viewport: Viewport;
  store: ViewAtlasStore;
  annotations: AnnotationsRenderer;
  /** Takes the Draw tool into hand with these choices. */
  tool(choices: Partial<DrawToolChoices>): void;
  pointer(type: 'pointerdown' | 'pointermove' | 'pointerup', x: number, y: number, alt?: boolean): void;
  /** The pointer over the map at a screen point, as the viewport's dispatch tells the drawings of every move: the cursor they answer. */
  hover(x: number, y: number, alt?: boolean): string | null;
  /** The GM's picture of the stage, and the players' frame of it. */
  gm(): Uint8ClampedArray;
  players(): Uint8ClampedArray;
}

const cleanup: (() => void)[] = [];
afterEach(() => { while (cleanup.length) cleanup.pop()!(); });

/** The stage of `app` as it renders with `layers` set for the one render. */
function picture(app: Application, layers: readonly LayerVisibility[], width: number, height: number): Uint8ClampedArray {
  const target = RenderTexture.create({ width, height });
  let pixels = new Uint8ClampedArray();
  captureWithLayerVisibility(layers, () => undefined, () => {
    app.renderer.render({ container: app.stage, target, clear: true, clearColor: app.renderer.background.colorRgba });
    pixels = app.renderer.extract.pixels({ target }).pixels;
  });
  target.destroy(true);
  return pixels;
}

/** A view of a black map whose screen is its world, with the drawings and the Draw tool on it. */
async function open(width = WIDTH, height = HEIGHT): Promise<Scene> {
  const app = new Application();
  await app.init({ width, height, preference: 'webgl', antialias: false, autoStart: false, backgroundColor: 0x000000 });
  const viewport = new Viewport({ screenWidth: width, screenHeight: height, worldWidth: 4000, worldHeight: 4000, events: app.renderer.events, ticker: app.ticker });
  viewport.sortableChildren = true;
  app.stage.addChild(viewport);
  const store = createViewAtlasStore(createInMemoryApp().app, `annotations-${Math.random()}`);
  store.getState().setPersistenceEnabled(false);
  store.getState().setMapPath('maps/drawn.atlasmap');
  const annotations = new AnnotationsRenderer({ viewport, store, grid: () => null });
  const boundary = new EventBoundary(viewport);
  cleanup.push(() => {
    annotations.destroy();
    // The viewport first: it takes itself off the app's ticker, which the app then destroys.
    viewport.destroy();
    app.destroy(true, { children: true });
  });
  return {
    app, viewport, store, annotations,
    tool: (choices) => {
      store.getState().setDrawTool(choices);
      store.getState().setActiveTool('draw');
    },
    pointer: (type, x, y, alt = false) => {
      const event = new FederatedPointerEvent(boundary);
      event.button = 0;
      event.altKey = alt;
      event.global.set(x, y);
      viewport.emit(type, event);
    },
    hover: (x, y, alt = false) => {
      const world = viewport.toWorld(x, y);
      return annotations.pointer.cursorAt(world.x, world.y, () => false, alt);
    },
    gm: () => picture(app, [], width, height),
    players: () => picture(app, annotations.getPlayerViewLayers(), width, height),
  };
}

const at = (pixels: Uint8ClampedArray, x: number, y: number, width = WIDTH): Rgb => {
  const i = (Math.round(y) * width + Math.round(x)) * 4;
  return [pixels[i]!, pixels[i + 1]!, pixels[i + 2]!];
};
const pen = (points: readonly (readonly [number, number])[], more: Partial<DrawingStroke> = {}): Omit<DrawingStroke, 'id' | 'kind' | 'timestamp'> =>
  ({ type: 'pen', points: points.map(([x, y]) => ({ x, y })), color: '#ffffff', width: 12, opacity: 1, ...more });

describe('the drawings on the map, as they are drawn', () => {
  it('draws a see-through stroke in one tone, also where it crosses itself', async () => {
    const s = await open();
    // A figure of eight: its two long strokes cross at (200, 150).
    s.store.getState().addDrawing(pen([[60, 60], [340, 240], [340, 60], [60, 240]], { width: 24, opacity: 0.5 }));
    const pixels = s.gm();
    const arm = at(pixels, 110, 92)[0];
    const crossing = at(pixels, 200, 150)[0];
    const corner = at(pixels, 338, 150)[0];
    expect(arm).toBeGreaterThan(110);
    expect(arm).toBeLessThan(145);
    expect(Math.abs(crossing - arm)).toBeLessThanOrEqual(2);
    expect(Math.abs(corner - arm)).toBeLessThanOrEqual(2);
    // Nowhere on the map is the ink darker than on one stroke.
    let most = 0;
    for (let i = 0; i < pixels.length; i += 4) most = Math.max(most, pixels[i]!);
    expect(most - arm).toBeLessThanOrEqual(2);
  });

  it('shows a see-through stroke under way in the tone it will have, also where it crosses itself', async () => {
    const s = await open();
    s.tool({ mode: 'pen', size: 'xl', seeThrough: true });
    const path: [number, number][] = [[60, 60], [340, 240], [340, 60], [60, 240]];
    s.pointer('pointerdown', ...path[0]!);
    // Many small moves, as a hand makes them: the stroke follows them closely.
    for (let corner = 1; corner < path.length; corner++) {
      const [from, to] = [path[corner - 1]!, path[corner]!];
      for (let step = 1; step <= 40; step++) s.pointer('pointermove', from[0] + ((to[0] - from[0]) * step) / 40, from[1] + ((to[1] - from[1]) * step) / 40);
    }
    const under = s.gm();
    const tone = (pixels: Uint8ClampedArray): number[] => [at(pixels, 110, 92)[0], at(pixels, 200, 150)[0], at(pixels, 290, 92)[0]];
    const [arm, crossing] = tone(under);
    expect(arm).toBeGreaterThan(110);
    expect(arm).toBeLessThan(145);
    expect(Math.abs(crossing! - arm!)).toBeLessThanOrEqual(2);
    // Players see it grow in the same tone.
    expect(tone(s.players())).toEqual(tone(under));
    // Let go, it is the drawing that was seen under the pointer.
    s.pointer('pointerup', ...path.at(-1)!);
    expect(Object.keys(s.store.getState().objects.drawings)).toHaveLength(1);
    const made = tone(s.gm());
    for (const [index, value] of tone(under).entries()) expect(Math.abs(made[index]! - value)).toBeLessThanOrEqual(2);
  });

  it('fills a closed shape softly under its line, and leaves its holes open', async () => {
    const s = await open();
    const room: [number, number][] = [[60, 60], [340, 60], [340, 240], [60, 240], [60, 60]];
    s.store.getState().addDrawing({
      ...pen(room, { width: 8 }), type: 'line', fill: 'soft',
      holes: [[{ x: 180, y: 130 }, { x: 220, y: 130 }, { x: 220, y: 170 }, { x: 180, y: 170 }]],
    });
    const pixels = s.gm();
    expect(at(pixels, 60, 150)[0]).toBe(255);
    const inside = at(pixels, 120, 150)[0];
    expect(inside).toBeGreaterThan(50);
    expect(inside).toBeLessThan(80);
    expect(at(pixels, 200, 150)[0]).toBe(0);
    expect(at(pixels, 20, 150)[0]).toBe(0);
  });

  it('keeps what only the GM sees, the stroke under way of it and the eraser\'s ring out of a players\' frame', async () => {
    const s = await open();
    const state = s.store.getState();
    state.addDrawing(pen([[40, 200], [160, 200]], { color: '#ff0000', hidden: true }));
    state.addDrawing(pen([[40, 250], [160, 250]], { color: '#00ff00' }));
    state.addDrawing(pen([[240, 250], [360, 250]], { color: '#ff0000', hidden: true, layer: 'map' }));

    // The GM sees the hidden drawings paler; the players' frame has neither, and all of what is shown.
    let [gm, players] = [s.gm(), s.players()];
    expect(at(gm, 100, 200)[0]).toBeGreaterThan(100);
    expect(at(gm, 100, 200)[0]).toBeLessThan(160);
    expect(at(gm, 300, 250)[0]).toBeGreaterThan(100);
    expect(at(players, 100, 200)).toEqual([0, 0, 0]);
    expect(at(players, 300, 250)).toEqual([0, 0, 0]);
    expect(at(gm, 100, 250)).toEqual([0, 255, 0]);
    expect(at(players, 100, 250)).toEqual([0, 255, 0]);

    // The eraser's ring follows the pointer on the GM's canvas alone.
    s.tool({ mode: 'eraser', size: 'm' });
    s.pointer('pointermove', 300, 60);
    const rim = 300 + eraserRadius('m', DEFAULT_CELL);
    /** The most red in the row of pixels across the ring's line. */
    const ring = (pixels: Uint8ClampedArray): number => Math.max(...[-2, -1, 0, 1, 2].map((offset) => at(pixels, Math.floor(rim) + offset, 60)[0]));
    [gm, players] = [s.gm(), s.players()];
    expect(ring(gm)).toBeGreaterThan(40);
    expect(ring(players)).toBe(0);

    // What a press will place is the GM's cursor, and nobody else's picture: the stamp to be, see-through, and the pen's dot.
    s.tool({ mode: 'stamp', icon: 'skull', color: '#00ffff', size: 'm' });
    expect(s.hover(300, 60)).toBe('none');
    /** The pixels of the stamp's cell that its symbol tints. */
    const stamped = (pixels: Uint8ClampedArray): number => {
      let count = 0;
      for (let y = 25; y < 95; y++) for (let x = 265; x < 335; x++) if (at(pixels, x, y)[1] > 100) count++;
      return count;
    };
    await vi.waitFor(() => expect(stamped(s.gm())).toBeGreaterThan(200));
    // Six tenths of the symbol's colour: it is not on the map yet.
    expect(Math.max(...[40, 50, 60, 70, 80].flatMap((y) => [280, 290, 300, 310, 320].map((x) => at(s.gm(), x, y)[1])))).toBeLessThan(170);
    expect(stamped(s.players())).toBe(0);
    expect(stamped(picture(s.app, s.annotations.getPictureLayers(), WIDTH, HEIGHT))).toBe(0);
    s.tool({ mode: 'pen', color: '#ff00ff', size: 'xl' });
    expect(s.hover(300, 60)).toBe('none');
    [gm, players] = [s.gm(), s.players()];
    expect(at(gm, 300, 60)).toEqual([255, 0, 255]);
    expect(at(players, 300, 60)).toEqual([0, 0, 0]);
    expect(at(picture(s.app, s.annotations.getPictureLayers(), WIDTH, HEIGHT), 300, 60)).toEqual([0, 0, 0]);
    // Nothing of it was written.
    expect(Object.keys(s.store.getState().objects.drawings)).toHaveLength(3);
    s.annotations.pointer.leave();
    expect(at(s.gm(), 300, 60)).toEqual([0, 0, 0]);

    // A stroke under way that players will not see is the GM's alone; one they will see grows in their frame too.
    s.tool({ mode: 'pen', color: '#0000ff', size: 'xl', players: false });
    s.pointer('pointerdown', 200, 120);
    s.pointer('pointermove', 300, 120);
    [gm, players] = [s.gm(), s.players()];
    expect(at(gm, 250, 120)[2]).toBeGreaterThan(100);
    expect(at(players, 250, 120)).toEqual([0, 0, 0]);
    s.annotations.leave();
    s.tool({ mode: 'pen', players: true });
    s.pointer('pointerdown', 200, 120);
    s.pointer('pointermove', 300, 120);
    [gm, players] = [s.gm(), s.players()];
    expect(at(gm, 250, 120)).toEqual([0, 0, 255]);
    expect(at(players, 250, 120)).toEqual([0, 0, 255]);
    s.pointer('pointerup', 300, 120);

    // While the canvas itself shows the players' picture, it has none of it either, and a picture of the scene never has.
    s.store.getState().setGMView(false);
    expect(at(s.gm(), 100, 200)).toEqual([0, 0, 0]);
    s.store.getState().setGMView(true);
    expect(at(picture(s.app, s.annotations.getPictureLayers(), WIDTH, HEIGHT), 100, 200)).toEqual([0, 0, 0]);
    expect(at(s.gm(), 100, 200)[0]).toBeGreaterThan(100);
  });

  /** How far the middle of each pixel lies from the eraser's path through `sweep`. */
  const fromSweep = (sweep: readonly (readonly [number, number])[]) => (x: number, y: number): number =>
    Math.sqrt(Math.min(...sweep.slice(1).map(([bx, by], index) => segmentDistanceSq(x + 0.5, y + 0.5, sweep[index]![0], sweep[index]![1], bx, by))));

  function erase(s: Scene, sweep: readonly (readonly [number, number])[]): void {
    s.tool({ mode: 'eraser', size: 'm' });
    s.pointer('pointerdown', ...sweep[0]!);
    for (const [x, y] of sweep.slice(1)) s.pointer('pointermove', x, y);
    s.pointer('pointerup', ...sweep.at(-1)!);
    // The eraser's ring goes with the tool: the picture is of the drawings alone.
    s.store.getState().setActiveTool('move');
  }

  it('cuts a fill exactly where the eraser passed: what lies outside its sweep stays, nothing is left inside it', async () => {
    const s = await open();
    // A solid floor without a line, and a doorway cut through its wall into its middle.
    s.store.getState().addDrawing({ ...pen([[60, 60], [340, 60], [340, 240], [60, 240], [60, 60]], { width: 0 }), type: 'rectangle', fill: 'solid' });
    const before = s.gm();
    const sweep: [number, number][] = [[230, 30], [230, 150], [170, 190]];
    erase(s, sweep);
    const after = s.gm();
    const radius = eraserRadius('m', DEFAULT_CELL);
    const distance = fromSweep(sweep);
    let [kept, gone] = [0, 0];
    for (let y = 0; y < HEIGHT; y++) {
      for (let x = 0; x < WIDTH; x++) {
        const was = at(before, x, y)[0];
        const is = at(after, x, y)[0];
        const from = distance(x, y);
        // A pixel and a half of slack along the eraser's edge: the cut lies within a quarter pixel of it.
        if (from > radius + 1.5) {
          expect(is, `the fill at ${x},${y}, outside the sweep`).toBe(was);
          if (was > 0) kept++;
        } else if (from < radius - 1.5) {
          expect(is, `the fill at ${x},${y}, inside the sweep`).toBe(0);
          if (was > 0) gone++;
        }
      }
    }
    expect(kept).toBeGreaterThan(40_000);
    expect(gone).toBeGreaterThan(4000);
  });

  it('cuts a line where its own edge meets the eraser\'s: no ink is left inside the sweep, and none is taken a line\'s width beyond it', async () => {
    const s = await open();
    const widths = [12, 8];
    s.store.getState().addDrawing(pen([[40, 150], [360, 150]], { width: widths[0]! }));
    s.store.getState().addDrawing(pen([[40, 60], [360, 240]], { width: widths[1]! }));
    const before = s.gm();
    const sweep: [number, number][] = [[230, 90], [230, 150], [190, 210]];
    erase(s, sweep);
    const after = s.gm();
    const radius = eraserRadius('m', DEFAULT_CELL);
    const distance = fromSweep(sweep);
    let [kept, gone] = [0, 0];
    for (let y = 0; y < HEIGHT; y++) {
      for (let x = 0; x < WIDTH; x++) {
        const was = at(before, x, y)[0];
        const is = at(after, x, y)[0];
        const from = distance(x, y);
        // A piece ends in a round end that touches the sweep from outside, so beside that end a line loses up to its own width.
        if (from > radius + Math.max(...widths) + 1.5) {
          expect(is, `ink at ${x},${y}, beyond the sweep`).toBe(was);
          if (was > 0) kept++;
        } else if (from < radius - 1.5) {
          expect(is, `ink at ${x},${y}, inside the sweep`).toBe(0);
          if (was > 0) gone++;
        }
      }
    }
    expect(kept).toBeGreaterThan(4000);
    expect(gone).toBeGreaterThan(400);
    // Each piece's end reaches the eraser's edge: ink stands within two pixels of it on both lines.
    const reached = (near: (x: number, y: number) => boolean): boolean => {
      for (let y = 0; y < HEIGHT; y++) {
        for (let x = 0; x < WIDTH; x++) if (near(x, y) && at(after, x, y)[0] > 0 && distance(x, y) < radius + 2) return true;
      }
      return false;
    };
    expect(reached((_x, y) => Math.abs(y - 150) <= 2)).toBe(true);
    expect(Object.keys(s.store.getState().objects.drawings).length).toBeGreaterThan(2);
  });
});

describe('the drawings on the map, under the lighting', () => {
  const MAP = 256;

  it('lights a drawing on the map like the floor, and leaves one above the tokens as it is', async () => {
    const view = await openLitView({ pane: { width: MAP, height: MAP }, map: MAP });
    const { app, viewport, store, controller, displayFrames } = view;
    // The helper's floor stands in for the map image, which lies beneath everything.
    viewport.children[0]!.zIndex = MAP_LAYER_Z.mapImage;
    // A token's stand-in, in the lit room: what lies on the map lies under it.
    const tokens = viewport.addChild(new Sprite(Texture.WHITE));
    tokens.tint = 0x3050d0;
    tokens.setSize(24, 24);
    tokens.position.set(60, 68);
    const annotations = new AnnotationsRenderer({ viewport, store, grid: () => null });
    cleanup.push(() => { annotations.destroy(); view.dispose(); });
    const state = store.getState();
    // Two rooms parted by a wall down the middle, a lamp in the left one, no light of the scene's own.
    state.setSceneLighting({ enabled: true, ambient: 0 });
    state.addWall({ type: 'solid', p1: { x: 128, y: -64 }, p2: { x: 128, y: 320 } });
    state.addLight({ x: 64, y: 128, emission: { bright: 10, dim: 20, color: '#ffffff', intensity: 1, animation: 'none' } });
    state.addDrawing(pen([[20, 80], [236, 80]], { layer: 'map' }));
    state.addDrawing(pen([[20, 180], [236, 180]]));
    // A see-through stroke under way on the map, across both rooms.
    state.setDrawTool({ mode: 'pen', size: 'xl', layer: 'map', seeThrough: true });
    state.setActiveTool('draw');
    const boundary = new EventBoundary(viewport);
    for (const [type, x] of [['pointerdown', 20], ['pointermove', 128], ['pointermove', 236]] as const) {
      const event = new FederatedPointerEvent(boundary);
      event.button = 0;
      event.global.set(x, 40);
      viewport.emit(type, event);
    }
    displayFrames(30);
    const read = (layers: readonly LayerVisibility[]): Uint8ClampedArray => {
      const pixels = picture(app, layers, MAP, MAP);
      app.renderer.render({ container: app.stage });
      return pixels;
    };
    const players = read([...controller.playerLayers(), ...annotations.getPlayerViewLayers()]);
    const lum = ([r, g, b]: Rgb): number => (r + g + b) / 3;
    // On the map: bright in the lamp's room, nothing of it in the room no light reaches, and under the token.
    expect(lum(at(players, 40, 80, MAP))).toBeGreaterThan(150);
    expect(lum(at(players, 200, 80, MAP))).toBeLessThan(8);
    expect(at(players, 72, 80, MAP)[2]).toBeGreaterThan(at(players, 72, 80, MAP)[0] + 40);
    // Above the tokens: as bright in the dark room as in the lit one.
    expect(lum(at(players, 40, 180, MAP))).toBeGreaterThan(240);
    expect(lum(at(players, 200, 180, MAP))).toBeGreaterThan(240);
    // The stroke under way lies on the map too: brighter than the lit floor beside it, and dark where the room is.
    expect(lum(at(players, 40, 40, MAP))).toBeGreaterThan(lum(at(players, 40, 58, MAP)) + 15);
    expect(lum(at(players, 200, 40, MAP))).toBeLessThan(8);
    // The GM reads the map's own drawing in the dark room too.
    expect(lum(at(read([]), 200, 80, MAP))).toBeGreaterThan(8);
  });
});

describe('what the drawings cost', () => {
  /** Mulberry32: the same scene every run. */
  function seeded(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
      state = (state + 0x6d2b79f5) >>> 0;
      let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
      mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
      return ((mixed ^ (mixed >>> 14)) >>> 0) / 2 ** 32;
    };
  }

  const WORLD = 4000;
  /** One short of what a level holds: the stroke drawn below is its last. */
  const DRAWINGS = 1999;
  const POINTS = 100;
  const median = (values: readonly number[]): number => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]!;
  const share = (values: readonly number[], of: number): number => [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor(values.length * of))]!;
  const ms = (value: number): string => `${value.toFixed(3)} ms`;

  it('renders nothing while nothing changes: at rest, and with the pen in hand once the pointer rests; a move draws the pen\'s dot alone, once a frame', async () => {
    const s = await open();
    const scheduler = new RenderScheduler(s.app);
    cleanup.push(() => scheduler.destroy());
    for (let index = 0; index < 40; index++) s.store.getState().addDrawing(pen([[20 + index * 9, 40], [20 + index * 9, 260]], { width: 3 }));
    s.store.getState().addText({ x: 200, y: 150, text: 'Gate', fontSize: 24, fontFamily: 'Arial', color: '#ffffff' });
    let time = 1000;
    const ticks = (count: number): void => { for (let i = 0; i < count; i++) s.app.ticker.update(time += 16); };
    ticks(30);
    const rendered = vi.spyOn(s.app.renderer, 'render');
    ticks(30);
    expect(rendered).not.toHaveBeenCalled();
    s.tool({ mode: 'pen' });
    ticks(5);
    expect(rendered).not.toHaveBeenCalled();
    // The dot under the pointer is the cursor: however many moves a frame brings, it is one render, and none once the pointer rests.
    const built = s.annotations.layer.drawn;
    for (let x = 50; x < 350; x += 10) {
      s.pointer('pointermove', x, 100);
      s.hover(x, 100);
    }
    ticks(1);
    expect(rendered).toHaveBeenCalledTimes(1);
    ticks(5);
    expect(rendered).toHaveBeenCalledTimes(1);
    expect(s.annotations.layer.drawn).toBe(built);
    // A stroke under way is a change, and so is its drawing.
    rendered.mockClear();
    s.pointer('pointerdown', 50, 100);
    s.pointer('pointermove', 150, 120);
    ticks(1);
    expect(rendered).toHaveBeenCalledTimes(1);
    s.pointer('pointerup', 150, 120);
    ticks(3);
    expect(rendered).toHaveBeenCalledTimes(2);
    rendered.mockRestore();
  });

  it('draws only the stroke under way with a pointer move, and nothing with a pan, on a map as full of drawings as a level may be', async () => {
    const s = await open(1440, 900);
    const random = seeded(7);
    const drawings: Record<string, DrawingStroke> = {};
    for (let index = 0; index < DRAWINGS; index++) {
      let x = random() * WORLD;
      let y = random() * WORLD;
      const points = Array.from({ length: POINTS }, () => {
        x += (random() - 0.5) * 12;
        y += (random() - 0.5) * 12;
        return { x, y };
      });
      const id = `d${index}`;
      drawings[id] = { id, kind: 'drawing', timestamp: 1, type: 'pen', points, color: index % 2 ? '#ffffff' : '#ffcc00', width: 4, opacity: 1, order: index + 1 };
    }
    const gl = (s.app.renderer as unknown as { gl: WebGL2RenderingContext }).gl;
    const frame = (): number => {
      const start = performance.now();
      s.app.ticker.update(time += 16);
      s.app.renderer.render({ container: s.app.stage });
      gl.finish();
      return performance.now() - start;
    };
    let time = 1000;
    const beforeRead = performance.now();
    s.store.setState({ objects: { ...s.store.getState().objects, drawings } });
    const read = performance.now() - beforeRead;
    // What the camera shows is drawn over some frames, a part at each.
    const building = [frame()];
    while (s.annotations.layer.building) building.push(frame());
    building.push(frame());
    const builtOnScreen = s.annotations.layer.drawn;
    // The camera shows a part of the map: what lies off screen is not built.
    expect(builtOnScreen).toBeGreaterThan(50);
    expect(builtOnScreen).toBeLessThan(DRAWINGS / 2);

    /** A wavy stroke of 600 moves across the view, each move timed, and each frame after it. */
    const stroke = (): { moves: number[]; frames: number[] } => {
      const moves: number[] = [];
      const frames: number[] = [];
      s.pointer('pointerdown', 200, 200);
      for (let step = 1; step <= 600; step++) {
        const start = performance.now();
        s.pointer('pointermove', 200 + step * 1.7, 200 + Math.sin(step / 9) * 120 + step * 0.6);
        moves.push(performance.now() - start);
        frames.push(frame());
      }
      return { moves, frames };
    };

    // A pen's stroke: every move draws the stroke under way and none of the drawings on the map.
    s.tool({ mode: 'pen', size: 'm' });
    const { moves, frames } = stroke();
    expect(s.annotations.layer.drawn).toBe(builtOnScreen);
    s.pointer('pointerup', 1220, 560);
    expect(s.annotations.layer.drawn).toBe(builtOnScreen + 1);
    expect(Object.keys(s.store.getState().objects.drawings)).toHaveLength(DRAWINGS + 1);
    // A see-through stroke is one even tone over all of itself, so each move works its whole outline out anew. Dropped: the level is full.
    s.tool({ mode: 'pen', seeThrough: true });
    const even = stroke();
    s.annotations.leave();

    // A pan across the map: a frame shows and hides what comes and goes, and draws what comes into view for the first time.
    s.store.getState().setActiveTool('move');
    const pans: number[] = [];
    for (let step = 0; step < 240; step++) {
      s.viewport.moveCenter(720 + step * 12, 450 + step * 6);
      pans.push(frame());
    }
    while (s.annotations.layer.building) frame();
    const builtAfterPan = s.annotations.layer.drawn;
    expect(builtAfterPan).toBeGreaterThan(builtOnScreen + 100);
    // Back over the same ground: everything is drawn, a frame only shows and hides.
    const again: number[] = [];
    for (let step = 239; step >= 0; step--) {
      s.viewport.moveCenter(720 + step * 12, 450 + step * 6);
      again.push(frame());
    }
    expect(s.annotations.layer.drawn).toBe(builtAfterPan);
    // At rest nothing is drawn, shown or hidden.
    const rest = Array.from({ length: 30 }, frame);
    expect(s.annotations.layer.drawn).toBe(builtAfterPan);
    // All of the map at once, as a picture of the scene takes it: the rest of the drawings in one go.
    const beforeWhole = performance.now();
    s.annotations.showFor(null)();
    const whole = performance.now() - beforeWhole;
    const wholeFrame = frame();

    console.info([
      `Drawings: ${DRAWINGS} with ${DRAWINGS * POINTS} points on a ${WORLD} px map, view 1440 × 900 at zoom 1 (${builtOnScreen} of them in view).`,
      `Reading them and drawing the first part: ${ms(read)}. Drawing what the camera shows: ${building.length} frames, median ${ms(median(building))}, the longest ${ms(Math.max(...building))}.`,
      `Pen, the tool's own work per pointer move: median ${ms(median(moves))}, 95 % under ${ms(share(moves, 0.95))}, most ${ms(Math.max(...moves))}.`,
      `Pen, a frame after a move (tick, render, GPU done): median ${ms(median(frames))}, 95 % under ${ms(share(frames, 0.95))}.`,
      `See-through pen, per pointer move: median ${ms(median(even.moves))}, 95 % under ${ms(share(even.moves, 0.95))}, most ${ms(Math.max(...even.moves))}; a frame after it: median ${ms(median(even.frames))}.`,
      `Pan, a frame (first pass, ${builtAfterPan - builtOnScreen - 1} drawings come into view): median ${ms(median(pans))}, 95 % under ${ms(share(pans, 0.95))}, most ${ms(Math.max(...pans))}.`,
      `Pan, a frame (everything drawn): median ${ms(median(again))}, 95 % under ${ms(share(again, 0.95))}, most ${ms(Math.max(...again))}.`,
      `At rest, a frame: median ${ms(median(rest))}.`,
      `All ${DRAWINGS + 1} at once for a picture of the scene (${DRAWINGS + 1 - builtAfterPan} not drawn before): ${ms(whole)}, and ${ms(wholeFrame)} for the frame after.`,
    ].join('\n'));
    // The target is a millisecond of the tool's own work a move; the bound leaves room for a busy machine.
    expect(median(moves)).toBeLessThan(1);
  }, 120_000);

  it('shows what a press will place for the price of a look under the pointer, in Stamp mode on a level as full as it may be', async () => {
    const s = await open(1440, 900);
    const random = seeded(11);
    const drawings: Record<string, DrawingStroke> = {};
    // Half of them stamps, which the mode takes under the pointer, half of them lines, which it passes over.
    for (let index = 0; index < DRAWINGS + 1; index++) {
      let x = random() * WORLD;
      let y = random() * WORLD;
      const id = `d${index}`;
      const base = { id, kind: 'drawing' as const, timestamp: 1, color: '#ffffff', opacity: 1, order: index + 1 };
      drawings[id] = index % 2
        ? { ...base, type: 'icon', icon: 'skull', points: [{ x, y }], width: DEFAULT_CELL }
        : { ...base, type: 'pen', width: 4, points: Array.from({ length: POINTS }, () => ({ x: x += (random() - 0.5) * 12, y: y += (random() - 0.5) * 12 })) };
    }
    s.store.setState({ objects: { ...s.store.getState().objects, drawings } });
    let time = 1000;
    const gl = (s.app.renderer as unknown as { gl: WebGL2RenderingContext }).gl;
    const frame = (): number => {
      const start = performance.now();
      s.app.ticker.update(time += 16);
      s.app.renderer.render({ container: s.app.stage });
      gl.finish();
      return performance.now() - start;
    };
    frame();
    while (s.annotations.layer.building) frame();
    const built = s.annotations.layer.drawn;
    const rest = Array.from({ length: 30 }, frame);
    s.tool({ mode: 'stamp', icon: 'skull', size: 'm' });
    const heard = vi.fn();
    const stop = s.store.subscribe(heard);
    // The browser's clock ticks in tenths of a millisecond, so moves are timed a hundred at a time, a frame between the hundreds.
    const BATCH = 100;
    const moves: number[] = [];
    const frames: number[] = [];
    const cursors = new Map<string, number>();
    for (let step = 0; step < 4800; step += BATCH) {
      const answered: (string | null)[] = [];
      // The whole of what a pointer move asks of the drawings: what is under the pointer, its mark, the stamp to be.
      const start = performance.now();
      for (let move = step; move < step + BATCH; move++) answered.push(s.hover(100 + move / 4, 450 + Math.sin(move / 160) * 300));
      moves.push((performance.now() - start) / BATCH);
      for (const cursor of answered) cursors.set(String(cursor), (cursors.get(String(cursor)) ?? 0) + 1);
      frames.push(frame());
    }
    stop();
    // No drawing on the map is drawn anew, and the store hears nothing.
    expect(s.annotations.layer.drawn).toBe(built);
    expect(heard).not.toHaveBeenCalled();
    // The way led over stamps and beside them.
    expect(cursors.get('pointer') ?? 0).toBeGreaterThan(200);
    expect(cursors.get('none') ?? 0).toBeGreaterThan(2000);
    console.info([
      `Stamp mode over ${DRAWINGS + 1} drawings (${(DRAWINGS + 1) / 2} stamps, ${(DRAWINGS + 1) / 2} lines of ${POINTS} points) on a ${WORLD} px map, view 1440 × 900: ${moves.length * BATCH} pointer moves, ${cursors.get('pointer') ?? 0} of them over a stamp.`,
      `The tool's own work per pointer move (what lies under the pointer, its outline, the stamp to be), by hundreds of moves: median ${ms(median(moves))}, 95 % under ${ms(share(moves, 0.95))}, most ${ms(Math.max(...moves))}; all ${moves.length * BATCH} moves together ${ms(moves.reduce((sum, move) => sum + move, 0) * BATCH)}.`,
      `A frame after such moves (tick, render, GPU done): median ${ms(median(frames))}, 95 % under ${ms(share(frames, 0.95))}; at rest before, with the same drawings: median ${ms(median(rest))}.`,
    ].join('\n'));
    // The target is 0.3 ms a move.
    expect(median(moves)).toBeLessThan(0.3);
  }, 120_000);

  it('prints what a pan over a lit scene costs with a level full of drawings, beside the same scene without them', async () => {
    const MAP = 4096;
    const view = await openLitView({ pane: { width: 1440, height: 900 }, map: MAP, quality: LIGHTING_QUALITY.balanced });
    const { app, viewport, store, displayFrames } = view;
    let annotations: AnnotationsRenderer | null = null;
    const ownTicker = viewport.options.ticker;
    cleanup.push(() => {
      annotations?.destroy();
      // The viewport takes itself off the ticker it was made with.
      viewport.options.ticker = ownTicker;
      view.dispose();
    });
    const random = seeded(11);
    const state = store.getState();
    // Rooms of a dungeon: walls in a lattice with gaps, a lamp in every other room, a little light of the scene's own.
    state.setSceneLighting({ enabled: true, ambient: 0.2 });
    for (let i = 1; i < 8; i++) {
      for (let j = 0; j < 8; j++) {
        state.addWall({ type: 'solid', p1: { x: i * 512, y: j * 512 + 80 }, p2: { x: i * 512, y: j * 512 + 432 } });
        state.addWall({ type: 'solid', p1: { x: j * 512 + 80, y: i * 512 }, p2: { x: j * 512 + 432, y: i * 512 } });
      }
    }
    for (let i = 0; i < 8; i++) {
      for (let j = i % 2; j < 8; j += 2) state.addLight({ x: i * 512 + 256, y: j * 512 + 256, emission: { bright: 20, dim: 40, color: '#ffd9a0', intensity: 1, animation: 'none' } });
    }
    const gl = (app.renderer as unknown as { gl: WebGL2RenderingContext }).gl;
    /** One display frame with the camera at `step` of a pan across the map, until the GPU is done with it. */
    const frame = (step: number): number => {
      viewport.moveCenter(900 + step * 9, 700 + step * 7);
      const start = performance.now();
      displayFrames(1);
      gl.finish();
      return performance.now() - start;
    };
    const pan = (): number[] => Array.from({ length: 240 }, (_, step) => frame(step));
    displayFrames(60);
    pan();
    const bare = pan();

    // A level as full as it may be: every tenth drawing lies on the map, under the lighting, the rest above it.
    const drawings: Record<string, DrawingStroke> = {};
    for (let index = 0; index < 2000; index++) {
      let x = random() * MAP;
      let y = random() * MAP;
      const points = Array.from({ length: POINTS }, () => {
        x += (random() - 0.5) * 12;
        y += (random() - 0.5) * 12;
        return { x, y };
      });
      const id = `d${index}`;
      drawings[id] = { id, kind: 'drawing', timestamp: 1, type: 'pen', points, color: index % 2 ? '#ffffff' : '#ffcc00', width: 4, opacity: 1, order: index + 1, ...(index % 10 === 0 && { layer: 'map' as const }) };
    }
    // The drawings follow the camera in the view's own tick, as in a map view: the helper's viewport has another ticker.
    viewport.options.ticker = app.ticker;
    annotations = new AnnotationsRenderer({ viewport, store, grid: () => null });
    store.setState({ objects: { ...store.getState().objects, drawings } });
    displayFrames(60);
    // The first pass draws what comes into view; the second finds everything drawn.
    const first = pan();
    for (let waited = 0; annotations.layer.building && waited < 600; waited++) displayFrames(1);
    expect(annotations.layer.building).toBe(false);
    const drawn = pan();
    console.info([
      `A pan over a lit scene (${MAP} px, 112 walls, 32 lights, Balanced, view 1440 × 900), a frame (tick, render, GPU done):`,
      `without drawings: median ${ms(median(bare))}, 95 % under ${ms(share(bare, 0.95))};`,
      `with 2,000 drawings of 100 points, 200 of them on the map, first pass (${annotations.layer.drawn} drawn by its end): median ${ms(median(first))}, 95 % under ${ms(share(first, 0.95))}, most ${ms(Math.max(...first))};`,
      `the same pan again, everything drawn: median ${ms(median(drawn))}, 95 % under ${ms(share(drawn, 0.95))}, most ${ms(Math.max(...drawn))}.`,
    ].join('\n'));
    expect(annotations.layer.drawn).toBeGreaterThan(100);
  }, 180_000);
});
