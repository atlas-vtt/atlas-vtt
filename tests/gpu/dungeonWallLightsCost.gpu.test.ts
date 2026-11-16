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
 * What the wall lights of a large lived-in mansion and a large lived-in fortress cost the lighting
 * engine: each entrance floor at the scene's own size, walls as the scene holds them, with no light,
 * with its fires alone and with its fires and every wall light, at High and Saver. GPU milliseconds
 * (`EXT_disjoint_timer_query_webgl2`, the median of seven) of the first build (tiles, then bounce), a
 * flicker redraw and one frame of the composite over the whole floor and over a room, at 1440 × 900.
 * Written to `out/perf-wall-lights/cost.txt`; budgets with `VITE_PERF_STRICT`.
 */

const STRICT = import.meta.env.VITE_PERF_STRICT === '1';
const SCREEN = { width: 1440, height: 900 };
const RUNS = 7;
const FEET = { unitType: 'feet', ruleDistance: 5 } as const;

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
  wall: Record<string, LightSource>;
  room: { x: number; y: number };
  pxPerCell: number;
  bounds: { width: number; height: number };
}

/** The entrance floor of a large lived-in dungeon of three floors, as its scene holds it. */
function livedInFloor(theme: 'mansion' | 'fortress', seed: number): Floor {
  const model = generateDungeon({ seed, theme, tags: ['inhabited', 'large'], floors: 3 });
  const pxPerCell = suggestedPxPerCell(model);
  const layout = mapLayout(model, pxPerCell, DEFAULT_VIEW);
  const bounds = { width: layout.widthPx, height: layout.heightPx };
  const parts = dungeonScene(model, dungeonStyle('parchment'), DEFAULT_VIEW, { originCell: layout.originCell, pxPerCell }, bounds, FEET)!;
  const level = parts.levelIds![0]!;
  const onFloor = <T extends { levels?: string[] | 'all' }>(objects: Record<string, T>): T[] => Object.values(objects).filter((o) => Array.isArray(o.levels) && o.levels[0] === level);
  const walls = sealedWalls(onFloor(parts.scene.walls), worldTexel(bounds));
  const byKind = (kind: string): Record<string, LightSource> => Object.fromEntries(onFloor(parts.scene.lights).filter((light) => light.id.includes(kind)).map((light) => [light.id, light]));
  const fires = byKind('_fire_');
  const wall = byKind('_wall_');
  const scale = unitScaleOf({ unitDistance: 5 }, parts.scene.grid);
  return {
    fires, wall, pxPerCell, bounds, room: Object.values(wall)[0]!,
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

describe('the cost of a lived-in dungeon\'s wall lights', () => {
  it('lights every wall light of a large mansion and fortress at little cost, at High and Saver (written; budgets with VITE_PERF_STRICT)', { timeout: 900_000 }, async () => {
    const renderer = await createTestRenderer(64);
    const rows: string[] = [];
    try {
      const debug = renderer.gl.getExtension('WEBGL_debug_renderer_info');
      const gpu = debug ? String(renderer.gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)) : 'unknown';
      const timer = renderer.gl.getExtension('EXT_disjoint_timer_query_webgl2') as TimerExt | null;
      const ext = timer && !gpu.includes('SwiftShader') ? timer : null;
      for (const [theme, seed] of [['mansion', 7], ['fortress', 11]] as const) {
        const floor = livedInFloor(theme, seed);
        const count = Object.keys(floor.wall).length;
        expect(count).toBeGreaterThan(3);
        // The first engine on a context compiles the shaders: measured once and dropped.
        await measure(renderer, ext, 'high', floor, floor.fires, 'warm-up');
        const costs: Cost[] = [];
        for (const level of ['high', 'saver'] as const) {
          for (const [label, lights] of [['none', {}], [`${Object.keys(floor.fires).length} fires`, floor.fires], [`fires and ${count} wall lights`, { ...floor.fires, ...floor.wall }]] as const) costs.push(await measure(renderer, ext, level, floor, lights, label));
        }
        rows.push(`${theme} (seed ${seed}, large, entrance floor ${floor.bounds.width} × ${floor.bounds.height} px, ${floor.pxPerCell} px a cell):`, ...costs.map((cost) => JSON.stringify(cost)));
        if (STRICT && ext) {
          for (const level of ['high', 'saver'] as const) {
            const [none, , lit] = costs.filter((cost) => cost.level === level);
            expect(lit!.frameRoom!).toBeLessThan(none!.frameRoom! + 1);
            expect(lit!.flicker!).toBeLessThan(2);
            expect(lit!.build!).toBeLessThan(level === 'high' ? 1000 : 150);
          }
        }
      }
      await commands.writeFile('out/perf-wall-lights/cost.txt', `wall lights of lived-in dungeons (${gpu}), GPU ms:\n${rows.join('\n')}\n`);
    } finally {
      renderer.destroy();
    }
  });
});
