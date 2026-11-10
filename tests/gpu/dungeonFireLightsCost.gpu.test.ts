/// <reference types="vite/client" />
import { Container, Matrix, RenderTexture, Sprite, Texture, type WebGLRenderer } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { commands } from 'vitest/browser';
import { generateDungeon } from '../../src/app/dungeons/generate';
import { mapLayout, suggestedPxPerCell } from '../../src/app/dungeons/render/layoutSize';
import { dungeonScene } from '../../src/app/dungeons/scene/toScene';
import { DEFAULT_VIEW } from '../../src/app/dungeons/style';
import { dungeonStyle } from '../../src/app/dungeons/styleCatalog';
import { worldTexel } from '../../src/app/lighting/lightingConstants';
import { LIGHTING_QUALITY, type LightingQualityLevel } from '../../src/app/lighting/lightingQuality';
import { unitScaleOf } from '../../src/app/lighting/lightingUnits';
import { sealedWalls } from '../../src/app/lighting/sealWalls';
import { LightingEngine } from '../../src/app/pixi/lighting/engine/LightingEngine';
import type { EngineScene } from '../../src/app/pixi/lighting/engine/types';
import { createTestRenderer } from '../../src/app/pixi/lighting/engine/__tests__/gpuTestUtils';
import type { LightSource } from '../../src/app/types/lightingTypes';
import { activeLights, engineLight } from '../../src/app/vision/lightSources';
import { SEES_ALL } from '../../src/app/vision/sight';

/**
 * What a large lived-in mansion's fires cost the lighting engine: its entrance floor at the scene's
 * own size, walls as the scene holds them, without its fires, with every fireplace lit and with as
 * many torches in their places, at High and Saver. GPU milliseconds (`EXT_disjoint_timer_query_webgl2`,
 * the median of seven) of the first build (tiles, then bounce), a flicker redraw and one frame of the composite over the whole floor and over a
 * room, at 1440 × 900. Written to `out/perf-fire-lights/cost.txt`; budgets with `VITE_PERF_STRICT`.
 */

const STRICT = import.meta.env.VITE_PERF_STRICT === '1';
const SCREEN = { width: 1440, height: 900 };
const RUNS = 7;
const FEET = { unitType: 'feet', ruleDistance: 5 } as const;
const TORCH: LightSource['emission'] = { bright: 20, dim: 40, color: '#ff9a3c', intensity: 1, animation: 'torch', kind: 'torch', sourceRadius: 2 };

interface TimerExt { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number }

async function gpuMs(gl: WebGL2RenderingContext, ext: TimerExt | null, fn: () => void): Promise<number | null> {
  if (!ext) {
    fn();
    return null;
  }
  gl.getParameter(ext.GPU_DISJOINT_EXT);
  const query = gl.createQuery()!;
  gl.beginQuery(ext.TIME_ELAPSED_EXT, query);
  fn();
  gl.endQuery(ext.TIME_ELAPSED_EXT);
  while (!gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE)) await new Promise((r) => setTimeout(r, 5));
  const ns = gl.getQueryParameter(query, gl.QUERY_RESULT) as number;
  gl.deleteQuery(query);
  return gl.getParameter(ext.GPU_DISJOINT_EXT) ? null : ns / 1e6;
}

function median(values: (number | null)[]): number | null {
  const kept = values.filter((value): value is number => value !== null).sort((a, b) => a - b);
  return kept.length > 0 ? Math.round(kept[Math.floor(kept.length / 2)]! * 100) / 100 : null;
}

interface Floor {
  scene: (lights: Record<string, LightSource>) => EngineScene;
  fires: Record<string, LightSource>;
  room: { x: number; y: number };
  pxPerCell: number;
  bounds: { width: number; height: number };
}

/** The entrance floor of a large lived-in mansion of three floors, as its scene holds it. */
function mansionFloor(): Floor {
  const model = generateDungeon({ seed: 7, theme: 'mansion', tags: ['inhabited', 'large'], floors: 3 });
  const pxPerCell = suggestedPxPerCell(model);
  const layout = mapLayout(model, pxPerCell, DEFAULT_VIEW);
  const bounds = { width: layout.widthPx, height: layout.heightPx };
  const parts = dungeonScene(model, dungeonStyle('parchment'), DEFAULT_VIEW, { originCell: layout.originCell, pxPerCell }, bounds, FEET)!;
  const level = parts.levelIds![0]!;
  const onFloor = <T extends { levels?: string[] | 'all' }>(objects: Record<string, T>): T[] => Object.values(objects).filter((o) => Array.isArray(o.levels) && o.levels[0] === level);
  const walls = sealedWalls(onFloor(parts.scene.walls), worldTexel(bounds));
  const fires = Object.fromEntries(onFloor(parts.scene.lights).filter((light) => light.id.includes('_fire_')).map((light) => [light.id, light]));
  const scale = unitScaleOf({ unitDistance: 5 }, parts.scene.grid);
  return {
    fires, pxPerCell, bounds, room: Object.values(fires)[0]!,
    scene: (lights) => ({
      bounds, albedo: null, walls, sight: SEES_ALL, sightRadius: 37, ambient: 0.05, cellSize: parts.scene.grid.size,
      lights: activeLights(lights, {}, 0.05).map((light) => engineLight(light, scale)),
    }),
  };
}

/** One frame of a white map lit by `engine` through a camera `cells` cells across, centred on `at`. */
function framer(renderer: WebGLRenderer, engine: LightingEngine, target: RenderTexture, floor: Floor, at: { x: number; y: number }, cells: number): () => void {
  const stage = new Container();
  const map = new Sprite(Texture.WHITE);
  map.setSize(floor.bounds.width, floor.bounds.height);
  const world = new Container();
  world.addChild(map, engine.layer);
  stage.addChild(world);
  const scale = SCREEN.width / (cells * floor.pxPerCell);
  return () => {
    world.scale.set(scale);
    world.position.set(SCREEN.width / 2 - at.x * scale, SCREEN.height / 2 - at.y * scale);
    engine.setView(new Matrix(scale, 0, 0, scale, world.x, world.y).invert(), scale);
    renderer.render({ container: stage, target, clear: true });
  };
}

interface Cost { level: LightingQualityLevel; lights: string; build: number | null; bounce: number | null; flicker: number | null; frameFloor: number | null; frameRoom: number | null }

async function measure(renderer: WebGLRenderer, ext: TimerExt | null, level: LightingQualityLevel, floor: Floor, lights: Record<string, LightSource>, label: string): Promise<Cost> {
  const engine = new LightingEngine(renderer, LIGHTING_QUALITY[level]);
  const target = RenderTexture.create(SCREEN);
  try {
    engine.setEnabled(true);
    engine.setMode('player');
    const build = await gpuMs(renderer.gl, ext, () => engine.update(floor.scene(lights)));
    const bounce = await gpuMs(renderer.gl, ext, () => engine.flush());
    const whole = framer(renderer, engine, target, floor, { x: floor.bounds.width / 2, y: floor.bounds.height / 2 }, floor.bounds.width / floor.pxPerCell);
    const room = framer(renderer, engine, target, floor, floor.room, 14);
    const [floors, rooms, flickers]: (number | null)[][] = [[], [], []];
    for (let i = 0; i < RUNS; i++) {
      floors.push(await gpuMs(renderer.gl, ext, whole));
      rooms.push(await gpuMs(renderer.gl, ext, room));
      flickers.push(await gpuMs(renderer.gl, ext, () => engine.animate(10_000 + i * 1000)));
    }
    return { level, lights: label, build: median([build]), bounce: median([bounce]), flicker: LIGHTING_QUALITY[level].flickerMs === null ? 0 : median(flickers), frameFloor: median(floors), frameRoom: median(rooms) };
  } finally {
    engine.destroy();
    target.destroy(true);
  }
}

describe('the cost of a lived-in mansion\'s fires', () => {
  it('lights every fireplace of a large mansion at little cost, at High and Saver (written; budgets with VITE_PERF_STRICT)', { timeout: 600_000 }, async () => {
    const floor = mansionFloor();
    expect(Object.keys(floor.fires).length).toBeGreaterThan(3);
    const renderer = await createTestRenderer(64);
    try {
      const debug = renderer.gl.getExtension('WEBGL_debug_renderer_info');
      const gpu = debug ? String(renderer.gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)) : 'unknown';
      const timer = renderer.gl.getExtension('EXT_disjoint_timer_query_webgl2') as TimerExt | null;
      const ext = timer && !gpu.includes('SwiftShader') ? timer : null;
      // The first engine on a context compiles the shaders: measured once and dropped.
      await measure(renderer, ext, 'high', floor, floor.fires, 'warm-up');
      // The same number of torches where the fires burn, shining all around: what any lights there cost.
      const torches = Object.fromEntries(Object.values(floor.fires).map((fire) => [fire.id, { ...fire, rotation: undefined, emission: TORCH }]));
      const count = Object.keys(floor.fires).length;
      const costs: Cost[] = [];
      for (const level of ['high', 'saver'] as const) {
        for (const [label, lights] of [['none', {}], [`${count} fires`, floor.fires], [`${count} torches`, torches]] as const) costs.push(await measure(renderer, ext, level, floor, lights, label));
      }
      await commands.writeFile('out/perf-fire-lights/cost.txt', `fire lights of a large mansion's entrance floor (${floor.bounds.width} × ${floor.bounds.height} px, ${floor.pxPerCell} px a cell; ${gpu}), GPU ms:\n${costs.map((cost) => JSON.stringify(cost)).join('\n')}\n`);
      if (STRICT && ext) {
        for (const level of ['high', 'saver'] as const) {
          const [none, lit, torch] = costs.filter((cost) => cost.level === level);
          expect(lit!.frameRoom!).toBeLessThan(none!.frameRoom! + 1);
          expect(lit!.flicker!).toBeLessThan(2);
          // A fire costs no more to build than a torch at its place.
          expect(lit!.build!).toBeLessThanOrEqual(torch!.build! * 1.2);
        }
      }
    } finally {
      renderer.destroy();
    }
  });
});
