/// <reference types="vite/client" />
import '../setup/obsidianDom';
import { RenderTexture, type TextureSource, type WebGLRenderer } from 'pixi.js';
import { describe, expect, it, vi } from 'vitest';
import { LIGHTING_QUALITY, type LightingQuality } from '../../src/app/lighting/lightingQuality';
import { levelStack, shownAt, stackGrid } from '../../src/app/levels/levelStack';
import { artCells, OPEN_ALPHA_BYTE, type ArtAlpha } from '../../src/app/levels/artRaster';
import { NO_STRETCH } from '../../src/app/grid/mapStretch';
import type { SceneLevel } from '../../src/app/types/sceneLevelTypes';
import { TesseraDecoderClient } from '../../src/app/pixi/mosaicCanvas/TesseraDecoderClient';
import { workerPort } from '../../src/app/pixi/mosaicCanvas/tesseraPorts';
import TileWorker from '../../src/app/pixi/mosaicCanvas/tesseraWorker?worker&inline';
import { stampClip } from '../../src/app/levels/stackClip';
import type { TokenEntity } from '../../src/app/types';
import type { LightSource } from '../../src/app/types/lightingTypes';
import type { LevelSurface } from '../../src/app/types/sceneLevelTypes';
import type { WallSegment } from '../../src/app/types/wallTypes';
import { computeSight, lightReach, NO_SIGHT } from '../../src/app/vision/sight';
import { belowTokenPerception, sightBelow } from '../../src/app/vision/throughSight';
import { rng } from '../../src/app/pixi/lighting/engine/__tests__/fuzzRooms';
import { belowNoise, LEVELS, openLevelsView, paintedTexture, type FakeMap, type LevelsView } from '../helpers/levelsView';
import { roofMap } from '../helpers/roofsFuzz';
import { roofPieces } from '../../src/app/levels/roofs';
import { ambientRaster } from '../../src/app/lighting/ambientRaster';
import type { LightZone } from '../../src/app/types/lightingTypes';

vi.mock('events', async () => import('eventemitter3'));

const STRICT = import.meta.env.VITE_PERF_STRICT === '1';
const SAMPLES = 5;
const MAP = 8192;
const [WIDTH, HEIGHT] = [1440, 900];

interface TimerExt { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number }

/** GPU time of `fn` from a timer query; null when the GPU reported a disjoint event. */
async function gpuMs(gl: WebGL2RenderingContext, ext: TimerExt, fn: () => void): Promise<number | null> {
  gl.getParameter(ext.GPU_DISJOINT_EXT);
  const query = gl.createQuery()!;
  gl.beginQuery(ext.TIME_ELAPSED_EXT, query);
  fn();
  gl.endQuery(ext.TIME_ELAPSED_EXT);
  while (!gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE)) await new Promise((resolve) => setTimeout(resolve, 5));
  const ns = gl.getQueryParameter(query, gl.QUERY_RESULT) as number;
  gl.deleteQuery(query);
  return gl.getParameter(ext.GPU_DISJOINT_EXT) ? null : ns / 1e6;
}

/** The median of `SAMPLES` timings of `fn`, disjoint ones taken again. */
async function medianGpu(gl: WebGL2RenderingContext, ext: TimerExt, fn: () => void): Promise<number> {
  const taken: number[] = [];
  for (let attempt = 0; taken.length < SAMPLES && attempt < SAMPLES * 4; attempt++) {
    const ms = await gpuMs(gl, ext, fn);
    if (ms !== null) taken.push(ms);
  }
  taken.sort((a, b) => a - b);
  return taken[Math.floor(taken.length / 2)] ?? NaN;
}

function medianCpu(fn: () => void, runs = 9): number {
  const taken: number[] = [];
  for (let i = 0; i < runs; i++) {
    const start = performance.now();
    fn();
    taken.push(performance.now() - start);
  }
  taken.sort((a, b) => a - b);
  return taken[Math.floor(taken.length / 2)]!;
}

const BYTES: Record<string, number> = { rgba8unorm: 4, bgra8unorm: 4, rgba16float: 8, rgba32float: 16, r8unorm: 1, r16float: 2, r32float: 4, rg16float: 4, rg8unorm: 2 };

/** Graphics memory of every texture the renderer holds, in MB. */
function textureMb(renderer: WebGLRenderer): number {
  const managed = (renderer.texture as unknown as { managedTextures: TextureSource[] }).managedTextures;
  return managed.filter((source) => !!source).reduce((sum, source) => sum + source.pixelWidth * source.pixelHeight * (BYTES[source.format] ?? 4) * (source.antialias ? 4 : 1), 0) / 1e6;
}

const square = (x: number, y: number, side: number): LevelSurface['polygon'] => [{ x, y }, { x: x + side, y }, { x: x + side, y: y + side }, { x, y: y + side }];

/** Two floors of an 8,192 px map, each with walls, lights and tokens; an opening of 1,600 px in the middle of the upper one. */
function scene(level: 'upper' | 'ground', seed: number): { walls: Record<string, WallSegment>; lights: Record<string, LightSource>; tokens: Record<string, TokenEntity> } {
  const rand = rng(seed);
  const walls: Record<string, WallSegment> = {};
  for (let chain = 0; chain < 40; chain++) {
    let [x, y] = [2500 + rand() * 3200, 2500 + rand() * 3200];
    for (let step = 0; step < 6; step++) {
      const angle = rand() * Math.PI * 2;
      const length = 60 + rand() * 200;
      const id = `${level}-w${chain}-${step}`;
      walls[id] = { id, kind: 'wall', type: 'solid', levels: [level], p1: { x, y }, p2: { x: x + Math.cos(angle) * length, y: y + Math.sin(angle) * length } };
      x += Math.cos(angle) * length;
      y += Math.sin(angle) * length;
    }
  }
  const lights: Record<string, LightSource> = {};
  for (let i = 0; i < 10; i++) {
    const id = `${level}-l${i}`;
    lights[id] = { id, kind: 'light', levels: [level], x: 2800 + rand() * 2600, y: 2800 + rand() * 2600, emission: { bright: 20, dim: 40, color: '#ffcc88', intensity: 1, animation: 'none' } };
  }
  const tokens: Record<string, TokenEntity> = {};
  for (let i = 0; i < (level === 'upper' ? 3 : 20); i++) {
    const id = `${level}-t${i}`;
    tokens[id] = { id, kind: 'token', imagePath: '', x: 3000 + rand() * 2200, y: 3000 + rand() * 2200, level, ...(level === 'upper' && { vision: { enabled: true } }) } as TokenEntity;
  }
  return { walls, lights, tokens };
}

async function openScene(quality: LightingQuality): Promise<LevelsView> {
  const view = await openLevelsView({ map: MAP, pane: WIDTH, paneHeight: HEIGHT, below: belowNoise(512), quality });
  const upper = scene('upper', 3);
  const ground = scene('ground', 5);
  view.store.setState({
    mapLoaded: true, isMapLoading: false, levels: LEVELS, viewedLevel: 'upper',
    objects: {
      ...view.store.getState().objects,
      walls: { ...upper.walls, ...ground.walls }, lights: { ...upper.lights, ...ground.lights }, tokens: { ...upper.tokens, ...ground.tokens },
      levelSurfaces: { hole: { id: 'hole', kind: 'level-surface', level: 'upper', open: true, polygon: square(3300, 3300, 1600) } },
    },
  });
  view.store.getState().setSceneLighting({ enabled: true, ambient: 0.1 });
  await view.settle();
  // A tenth of the map's width on the screen: the opening fills about a third of it.
  view.viewport.scale.set(0.5);
  view.viewport.position.set(WIDTH / 2 - 4100 * 0.5, HEIGHT / 2 - 4100 * 0.5);
  return view;
}

describe('the cost of levels below (budgets asserted with VITE_PERF_STRICT)', () => {
  it.each([['high', LIGHTING_QUALITY.high], ['balanced', LIGHTING_QUALITY.balanced]] as const)('measures a view lit at %s on an 8,192 px map at 1440 × 900', async (name, quality, ctx) => {
    const view = await openScene(quality);
    try {
      const renderer = view.app.renderer as WebGLRenderer;
      const ext = renderer.gl.getExtension('EXT_disjoint_timer_query_webgl2') as TimerExt | null;
      if (!ext) ctx.skip('no GPU timer');
      const gl = renderer.gl;
      const target = RenderTexture.create({ width: WIDTH, height: HEIGHT });
      const stage = (): void => renderer.render({ container: view.app.stage, target, clear: true });
      view.controller.renderer.prepareBelow?.();
      const below = await medianGpu(gl, ext!, () => view.controller.renderer.prepareBelow?.());
      const withOpenings = await medianGpu(gl, ext!, stage);
      // A frame of the player window at its budget, through the same view.
      const frameTarget = RenderTexture.create({ width: 2560, height: 1440 });
      const frame = (): void => {
        view.controller.renderer.prepareBelow?.({ key: 'frame', width: 2560, height: 1440, mode: 'player' });
        renderer.render({ container: view.app.stage, target: frameTarget, clear: true });
      };
      const frameWith = await medianGpu(gl, ext!, frame);
      // Once both pictures have their textures: what is measured without openings has them too.
      const memoryWith = textureMb(renderer);
      const objects = view.store.getState().objects;
      // A drag step of a token that sees, with the level below drawn.
      const scout = 'upper-t0';
      const dragStep = (dx: number): void => {
        const tokens = view.store.getState().objects.tokens;
        view.store.setState({ objects: { ...view.store.getState().objects, tokens: { ...tokens, [scout]: { ...tokens[scout]!, x: tokens[scout]!.x + dx } } } });
      };
      let flip = 1;
      // The pointer holds the token, as during a drag.
      view.store.setState({ heldTokens: { [scout]: { x: objects.tokens[scout]!.x, y: objects.tokens[scout]!.y } } });
      const dragWith = medianCpu(() => dragStep(flip = -flip * 7), 15);

      view.store.setState({ objects: { ...objects, levelSurfaces: {} } });
      await view.settle();
      view.controller.renderer.prepareBelow?.();
      const memoryWithout = textureMb(renderer);
      const without = await medianGpu(gl, ext!, stage);
      const frameWithout = await medianGpu(gl, ext!, frame);
      const dragWithout = medianCpu(() => dragStep(flip = -flip * 7), 15);
      view.store.setState({ heldTokens: {} });
      target.destroy(true);
      frameTarget.destroy(true);

      // An idle map with steady lights renders nothing, openings and all.
      view.store.setState({ objects });
      await view.settle();
      const render = vi.spyOn(view.app, 'render');
      view.displayFrames(30);
      const idleRenders = render.mock.calls.length;
      render.mockRestore();

      const figures = {
        quality: name,
        belowMs: below, compositeMs: withOpenings - without, frameWithMs: frameWith, frameWithoutMs: frameWithout, frameMs: frameWith - frameWithout,
        dragWithMs: dragWith, dragWithoutMs: dragWithout, dragRatio: dragWith / dragWithout, belowMemoryMb: memoryWith - memoryWithout, idleRenders,
      };
      console.info(`levels cost: ${JSON.stringify(figures)}`);
      expect(idleRenders).toBe(0);
      if (STRICT) {
        expect(figures.compositeMs).toBeLessThan(0.2);
        expect(figures.belowMs).toBeLessThan(name === 'high' ? 1 : 0.5);
        expect(figures.frameMs).toBeLessThan(1.5);
        expect(figures.dragRatio).toBeLessThan(1.3);
      }
    } finally {
      view.dispose();
    }
  });

  it('works the stack out of surfaces and the tokens below out of it quickly', () => {
    const rand = rng(9);
    const grid = stackGrid({ width: MAP, height: MAP });
    const star = (cx: number, cy: number, reach: number): LevelSurface['polygon'] => Array.from({ length: 64 }, (_, i) => {
      const angle = (i / 64) * Math.PI * 2;
      const r = reach * (0.6 + rand() * 0.4);
      return { x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r };
    });
    const surfaces: LevelSurface[] = Array.from({ length: 64 }, (_, i) => ({ id: `s${i}`, kind: 'level-surface', open: i % 4 !== 3, polygon: star(800 + rand() * 6600, 800 + rand() * 6600, 300 + rand() * 500) }));
    let stack = levelStack({ id: 'upper', surfaces }, [{ id: 'ground', surfaces: [] }], ['ground'], grid);
    const stackMs = medianCpu(() => { stack = levelStack({ id: 'upper', surfaces }, [{ id: 'ground', surfaces: [] }], ['ground'], grid); }, 5);
    const clipMs = medianCpu(() => stampClip(stack, 1, { columns: 2048, rows: 2048, scale: 0.25, mapWidth: MAP, mapHeight: MAP }), 5);
    const sight = computeSight([{ tokenId: 'v', origin: { x: 4000, y: 4000 }, range: 20000, senses: [] }], []);
    const tokens = Object.fromEntries(Array.from({ length: 100 }, (_, i) => [`t${i}`, { id: `t${i}`, kind: 'token', imagePath: '', x: rand() * MAP, y: rand() * MAP } as TokenEntity]));
    const below = { stack, index: 1, sight: sightBelow(sight, NO_SIGHT), ambient: { ambient: 0.1 }, reaches: [lightReach({ x: 4000, y: 4000 }, 600, [])] };
    const perceiveMs = medianCpu(() => {
      const perceived = belowTokenPerception(below, tokens, { viewed: undefined, below: undefined });
      for (const id of Object.keys(tokens)) perceived(id);
    }, 9);
    console.info(`levels cost (CPU): ${JSON.stringify({ stackMs, clipMs, perceive100Ms: perceiveMs, openTexels: stack.cells.filter((cell) => cell === 1).length, sample: shownAt(stack, { x: 4000, y: 4000 }) })}`);
    if (STRICT) {
      expect(stackMs).toBeLessThan(30);
      expect(perceiveMs).toBeLessThan(1);
    }
  });

  it.each([['high', LIGHTING_QUALITY.high], ['balanced', LIGHTING_QUALITY.balanced]] as const)('measures two levels below through transparent art, lit at %s, on an 8,192 px map at 1440 × 900', async (name, quality, ctx) => {
    // The upper floor's map is transparent over a disc of 1,600 px: the ground floor shows there, and the cellar through a hole of the ground floor's.
    const side = 512;
    const disc = (cx: number, cy: number, r: number): ArtAlpha => ({ width: side, height: side, opaque: Uint8Array.from({ length: side * side }, (_, i) => (Math.hypot((i % side) + 0.5 - cx, Math.floor(i / side) + 0.5 - cy) < r ? 0 : 1)) });
    const scale = MAP / side;
    const maps: Record<string, FakeMap> = {
      'upper.png': { texture: paintedTexture(side, side, () => [140, 140, 140]), width: side, height: side, alpha: disc(256, 256, 800 / scale) },
      'ground.png': { texture: belowNoise(side), width: side, height: side, alpha: disc(256, 256, 300 / scale) },
      'cellar.png': { texture: paintedTexture(side, side, () => [200, 170, 30]), width: side, height: side },
    };
    const levels: SceneLevel[] = [
      { id: 'cellar', name: 'Cellar', elevation: { bottom: -10, top: 0 }, background: 'cellar.png' },
      ...LEVELS,
    ];
    const fitted = { offset: { x: 0, y: 0 }, scale, stretch: NO_STRETCH };
    const view = await openLevelsView({ map: MAP, pane: WIDTH, paneHeight: HEIGHT, quality, levels, maps, viewedPlacement: { x: scale, y: scale } });
    try {
      const upper = scene('upper', 3);
      const ground = scene('ground', 5);
      view.store.setState({
        mapLoaded: true, isMapLoading: false, levels, viewedLevel: 'upper', background: 'cellar.png',
        levelAlignments: { cellar: fitted, ground: fitted, upper: fitted },
        objects: { ...view.store.getState().objects, walls: { ...upper.walls, ...ground.walls }, lights: { ...upper.lights, ...ground.lights }, tokens: { ...upper.tokens, ...ground.tokens } },
      });
      view.store.getState().setSceneLighting({ enabled: true, ambient: 0.1 });
      await view.settle();
      await view.settle();
      view.viewport.scale.set(0.5);
      view.viewport.position.set(WIDTH / 2 - 4096 * 0.5, HEIGHT / 2 - 4096 * 0.5);
      const renderer = view.app.renderer as WebGLRenderer;
      const ext = renderer.gl.getExtension('EXT_disjoint_timer_query_webgl2') as TimerExt | null;
      if (!ext) ctx.skip('no GPU timer');
      const target = RenderTexture.create({ width: WIDTH, height: HEIGHT });
      const stage = (): void => renderer.render({ container: view.app.stage, target, clear: true });
      view.controller.renderer.prepareBelow?.();
      const host = view.controller.renderer as unknown as { view: { levelsBelow: { levels: Map<string, unknown> } } };
      const drawn = host.view.levelsBelow.levels.size;
      const memoryWith = textureMb(renderer);
      const below = await medianGpu(renderer.gl, ext!, () => view.controller.renderer.prepareBelow?.());
      const withLevels = await medianGpu(renderer.gl, ext!, stage);
      // The same scene seeing nothing below.
      view.store.setState({ levels: levels.map((level) => (level.id === 'upper' ? { ...level, sees: [] } : level)) });
      await view.settle();
      view.controller.renderer.prepareBelow?.();
      const memoryWithout = textureMb(renderer);
      const without = await medianGpu(renderer.gl, ext!, stage);
      target.destroy(true);
      const figures = { quality: name, levelsDrawn: drawn, belowMs: below, compositeMs: withLevels - without, belowMemoryMb: memoryWith - memoryWithout };
      console.info(`levels cost (two below, art): ${JSON.stringify(figures)}`);
      expect(drawn).toBe(2);
      if (STRICT) {
        expect(figures.belowMs).toBeLessThan(name === 'high' ? 2 : 1);
        expect(figures.compositeMs).toBeLessThan(0.3);
      }
    } finally {
      view.dispose();
    }
  });

  it('lays a map\'s transparent parts on the stack\'s grid quickly, and the tessera worker reads them from an 8,192 px map', async () => {
    const side = 2048;
    const rand = rng(13);
    const holes = Array.from({ length: 40 }, () => ({ x: rand() * side, y: rand() * side, r: 20 + rand() * 200 }));
    const opaque = new Uint8Array(side * side);
    for (let i = 0; i < opaque.length; i++) {
      const [x, y] = [i % side, Math.floor(i / side)];
      opaque[i] = holes.some((hole) => Math.abs(x - hole.x) < hole.r && Math.abs(y - hole.y) < hole.r && Math.hypot(x - hole.x, y - hole.y) < hole.r) ? 0 : 1;
    }
    const art = { width: MAP, height: MAP, alpha: { width: side, height: side, opaque } };
    const grid = stackGrid({ width: MAP, height: MAP });
    const level = medianCpu(() => artCells(art, NO_STRETCH, true, grid), 5);
    const turned = medianCpu(() => artCells(art, { x: 1.05, y: 1, rotation: 2.5 }, true, grid), 5);
    const cells = artCells(art, NO_STRETCH, true, grid);
    const stackMs = medianCpu(() => levelStack({ id: 'upper', surfaces: [], art: cells }, [{ id: 'ground', surfaces: [], art: cells }, { id: 'cellar', surfaces: [] }], ['ground', 'cellar'], grid), 5);

    // The worker reads an 8,192 px map's overview: built once, then read in the worker.
    const canvas = new OffscreenCanvas(MAP, MAP);
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#808080';
    context.fillRect(0, 0, MAP, MAP);
    for (const hole of holes) {
      context.beginPath();
      context.arc(hole.x * 4, hole.y * 4, hole.r * 4, 0, Math.PI * 2);
      context.save();
      context.globalCompositeOperation = 'destination-out';
      context.fill();
      context.restore();
    }
    const png = await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer();
    const client = new TesseraDecoderClient({ appId: null, worker: workerPort(() => new TileWorker({ name: 'levels cost worker' })) });
    try {
      const opened = await client.open(() => Promise.resolve(png.slice(0)), { path: 'maps/cost.png', size: png.byteLength, mtime: 1 });
      const start = performance.now();
      const read = await client.alphaRaster(opened.handle, 2048, OPEN_ALPHA_BYTE);
      const workerMs = performance.now() - start;
      const roofStart = performance.now();
      const pieces = await client.roofPieces(opened.handle, 2048);
      const workerRoofMs = performance.now() - roofStart;
      client.close(opened.handle);
      console.info(`levels cost (art): ${JSON.stringify({ artCellsMs: level, artCellsTurnedMs: turned, stackOfThreeMs: stackMs, workerAlphaMs: workerMs, workerRoofPiecesMs: workerRoofMs, roofPieces: pieces.count, overview: `${read.width}x${read.height}` })}`);
      expect([read.width, read.height]).toEqual([2048, 2048]);
      if (STRICT) {
        expect(workerMs).toBeLessThan(150);
        expect(level).toBeLessThan(150);
      }
    } finally {
      client.dispose();
    }
  }, 300_000);

  it('measures a roof over a lit view of an 8,192 px map at 1440 × 900, and its pieces and ambient light on the CPU', async (ctx) => {
    const rand = rng(17);
    const boxes = Array.from({ length: 40 }, (): [number, number, number, number] => {
      const [x, y] = [2500 + rand() * 3000, 2500 + rand() * 3000];
      return [x, y, x + 150 + rand() * 400, y + 150 + rand() * 400];
    });
    const roof = roofMap(2048, MAP, boxes, 'green', 3);
    const view = await openLevelsView({ map: MAP, pane: WIDTH, paneHeight: HEIGHT, roofs: true, maps: { 'roof.png': roof } });
    try {
      const upper = scene('upper', 3);
      // A party of thirty with darkvision: sixty senses each roof pixel looks through.
      const tokens = { ...upper.tokens };
      for (let i = 0; i < Number(import.meta.env.VITE_ROOF_PARTY ?? 30); i++) tokens[`p${i}`] = { id: `p${i}`, kind: 'token', imagePath: '', x: 2600 + rand() * 2800, y: 2600 + rand() * 2800, level: 'upper', vision: { enabled: true, senses: [{ id: 'darkvision', range: 60 }] } } as TokenEntity;
      const star = (cx: number, cy: number, reach: number): LightZone['polygon'] => Array.from({ length: 64 }, (_, i) => ({ x: cx + Math.cos((i / 64) * Math.PI * 2) * reach, y: cy + Math.sin((i / 64) * Math.PI * 2) * reach }));
      const zones: Record<string, LightZone> = Object.fromEntries(Array.from({ length: 16 }, (_, i) => [`z${i}`, { id: `z${i}`, kind: 'light-zone', levels: ['upper'], ambient: rand(), polygon: star(2600 + rand() * 2800, 2600 + rand() * 2800, 200 + rand() * 600) } as LightZone]));
      const objects = { ...view.store.getState().objects, walls: upper.walls, lights: upper.lights, tokens, lightZones: zones };
      view.store.setState({ mapLoaded: true, isMapLoading: false, levels: LEVELS, viewedLevel: 'upper', objects });
      view.store.getState().setSceneLighting({ enabled: true, ambient: 0.1 });
      await view.settle();
      view.viewport.scale.set(0.5);
      view.viewport.position.set(WIDTH / 2 - 4100 * 0.5, HEIGHT / 2 - 4100 * 0.5);
      const renderer = view.app.renderer as WebGLRenderer;
      const ext = renderer.gl.getExtension('EXT_disjoint_timer_query_webgl2') as TimerExt | null;
      if (!ext) ctx.skip('no GPU timer');
      const target = RenderTexture.create({ width: WIDTH, height: HEIGHT });
      const playersView = (): void => {
        const layers = view.controller.playerLayers();
        const before = layers.map(({ layer }) => layer.visible);
        for (const { layer, visible } of layers) layer.visible = visible;
        try {
          renderer.render({ container: view.app.stage, target, clear: true });
        } finally {
          layers.forEach(({ layer }, i) => { layer.visible = before[i]!; });
        }
      };
      const without = await medianGpu(renderer.gl, ext!, playersView);
      const memoryWithout = textureMb(renderer);
      view.store.setState({ levels: LEVELS.map((level) => (level.id === 'upper' ? { ...level, foreground: 'roof.png' } : level)) });
      await view.settle();
      playersView();
      const withRoof = await medianGpu(renderer.gl, ext!, playersView);
      const memoryWith = textureMb(renderer);
      const gm = await medianGpu(renderer.gl, ext!, () => renderer.render({ container: view.app.stage, target, clear: true }));
      // The roof's own pass, in the players' view: everything else of the stage left out.
      const others = view.viewport.children.filter((child) => child.label !== 'roof' && child.visible);
      for (const child of others) child.visible = false;
      const roofAlone = await medianGpu(renderer.gl, ext!, playersView);
      for (const child of others) child.visible = true;
      target.destroy(true);
      // What a token's step asks of the roof: its pieces faded anew, and the players' rule for a hundred tokens.
      const points = Array.from({ length: 100 }, () => ({ x: 2500 + rand() * 3000, y: 2500 + rand() * 3000 }));
      const coversMs = medianCpu(() => { for (const point of points) view.roofs!.covers(point); }, 9);
      // What the measurements above changed on the stage is drawn once; then an idle map with a roof renders nothing.
      view.displayFrames(2);
      const render = vi.spyOn(view.app, 'render');
      view.displayFrames(30);
      const idleRenders = render.mock.calls.length;
      render.mockRestore();

      const piecesMs = medianCpu(() => roofPieces(roof.roofAlpha!, roof.width, roof.height), 5);
      const light = { ambient: 0.1, zones: Object.values(zones) };
      const rasterMs = medianCpu(() => ambientRaster(light, stackGrid({ width: MAP, height: MAP })), 5);
      const figures = { roofPassMs: roofAlone, roofMs: withRoof - without, stageGmMs: gm, roofMemoryMb: memoryWith - memoryWithout, party: Number(import.meta.env.VITE_ROOF_PARTY ?? 30), covers100Ms: coversMs, idleRenders, piecesOf2048Ms: piecesMs, ambientRaster16ZonesMs: rasterMs, pieces: roofPieces(roof.roofAlpha!, roof.width, roof.height).count };
      console.info(`levels cost (roof): ${JSON.stringify(figures)}`);
      expect(idleRenders).toBe(0);
      if (STRICT) {
        expect(figures.roofPassMs).toBeLessThan(0.5);
        expect(figures.covers100Ms).toBeLessThan(1);
        expect(figures.piecesOf2048Ms).toBeLessThan(150);
      }
    } finally {
      view.dispose();
    }
  });
});
