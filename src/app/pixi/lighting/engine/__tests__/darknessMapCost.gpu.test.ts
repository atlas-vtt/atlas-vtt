import { afterEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { BUILT_IN_SENSES, GENERIC_SENSES } from '../../../../gameSystems/senses';
import type { MeasurementSettings } from '../../../../grid/measurementFormat';
import { LIGHTING_QUALITY } from '../../../../lighting/lightingQuality';
import type { TokenEntity } from '../../../../types';
import type { Point } from '../../../../types/visionTypes';
import type { WallSegment } from '../../../../types/wallTypes';
import { SceneModelBuilder, SceneSpots } from '../../../../vision/sceneModel';
import type { Sight } from '../../../../vision/sight';
import type { PierceShape } from '../DarknessMap';
import { ENGINE_SHADERS } from '../engineShaders';
import { LightingEngine } from '../LightingEngine';
import { SceneMaps } from '../SceneMaps';
import { pierceShapes, sightFromOutside } from '../senseDrawing';
import { rng } from './fuzzRooms';
import { createTestRenderer } from './gpuTestUtils';

const MAP = 4096;
const bounds = { width: MAP, height: MAP };
const ALL_SENSES = [...GENERIC_SENSES, ...Object.values(BUILT_IN_SENSES).flat()];
const rules = (): { definitions: typeof ALL_SENSES; conditions: [] } => ({ definitions: ALL_SENSES, conditions: [] });
const FEET = { mode: 'metric', unitType: 'feet', unitDistance: 5, diagonalRule: 'equidistant', rangeBands: [] } as unknown as MeasurementSettings;
type SceneState = Parameters<SceneModelBuilder['update']>[0];

const wall = (id: string, x1: number, y1: number, x2: number, y2: number): WallSegment => ({ id, kind: 'wall', type: 'solid', p1: { x: x1, y: y1 }, p2: { x: x2, y: y2 } });

/** 400 short walls east of a wall at x = 1500 that reaches past what eyes reach, which hides the darkness west of it from every token east of it. */
function walls(): Record<string, WallSegment> {
  const rand = rng(11);
  const list = [wall('divide', 1500, -2 * MAP, 1500, 3 * MAP)];
  while (list.length < 400) {
    const x = 1600 + rand() * 2400, y = rand() * MAP, a = rand() * Math.PI * 2;
    list.push(wall(`w${list.length}`, x, y, x + Math.cos(a) * 30, y + Math.sin(a) * 30));
  }
  return Object.fromEntries(list.map((w) => [w.id, w]));
}

function token(id: string, at: Point, isHidden = false): TokenEntity {
  return { id, kind: 'token', imagePath: `${id}.png`, ...at, size: 1, isHidden, vision: { enabled: true, senses: [{ id: 'dnd5e-darkvision' }] } } as TokenEntity;
}

/** Eight darkvision tokens, the last hidden from the players, so the GM's sight is another than theirs. */
function sceneOf(darkness: Point): SceneState {
  const tokens = Array.from({ length: 8 }, (_, i) => token(`t${i}`, { x: 2000 + i * 200, y: 1000 + i * 240 }, i === 7));
  return {
    objects: {
      walls: walls(),
      lights: { dark: { id: 'dark', kind: 'light', x: darkness.x, y: darkness.y, emission: { bright: 0, dim: 14, color: '#000000', intensity: 1, animation: 'none', darkness: true } } },
      tokens: Object.fromEntries(tokens.map((t) => [t.id, t])),
    },
    lighting: { enabled: true, ambient: 0 },
    grid: { size: 70 },
    heldTokens: {},
  } as unknown as SceneState;
}

const FAR = { x: 700, y: 2000 };
const NEAR = { x: 2800, y: 2000 };
const STEPS = 60;

const mean = (values: number[]): string => (values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(3);

/** Sight as after a move of the first `moved` regions' tokens: the same areas in polygons of their own. */
function shapesAfterMove(sight: Sight, moved: number): PierceShape[] {
  const copies = { ...sight, regions: sight.regions.map((region, i) => (i < moved && region.polygon ? { ...region, polygon: [...region.polygon] } : region)) };
  return [...pierceShapes(copies), ...sightFromOutside(copies)];
}

describe('what a redraw of the darkness map costs', () => {
  const cleanup: (() => void)[] = [];
  afterEach(() => {
    while (cleanup.length) cleanup.pop()!();
  });

  async function setUp(darkness: Point): Promise<{ engine: LightingEngine; maps: SceneMaps; sight: Sight; render: MockInstance }> {
    const renderer = await createTestRenderer(256);
    cleanup.push(() => renderer.destroy());
    const state = sceneOf(darkness);
    const { model } = new SceneModelBuilder().update(state, bounds, () => FEET, rules);
    const spots = new SceneSpots().update(model, state, () => FEET, rules);
    const engine = new LightingEngine(renderer, LIGHTING_QUALITY.high);
    cleanup.push(() => engine.destroy());
    engine.setEnabled(true);
    engine.setMode('player');
    engine.update({ bounds, albedo: null, walls: model.walls, lights: model.lights, sight: model.gmSight!, playerSight: model.sight, playerSpots: spots, sightRadius: 31, cellSize: 70, ambient: 0, spots });
    engine.flush();
    const maps = new SceneMaps(renderer, bounds, 2, { shader: ENGINE_SHADERS.zone });
    cleanup.push(() => maps.destroy());
    maps.setScene(model.walls, model.lights, false);
    maps.setPierce(shapesAfterMove(model.sight, 0));
    maps.drawDarkness();
    return { engine, maps, sight: model.sight, render: vi.spyOn(renderer, 'render') };
  }

  function timed(step: () => void): number {
    const start = performance.now();
    step();
    return performance.now() - start;
  }

  function redraws(maps: SceneMaps, sight: Sight, moved: number): number[] {
    return Array.from({ length: STEPS }, () => {
      maps.setPierce(shapesAfterMove(sight, moved));
      return timed(() => maps.drawDarkness());
    });
  }

  it('switching between the GM\'s and the players\' picture draws nothing, with a hidden vision token', async () => {
    const { engine, render } = await setUp(NEAR);
    const toggles = Array.from({ length: STEPS }, (_, i) => timed(() => engine.setMode(i % 2 ? 'player' : 'gm')));
    expect(render).not.toHaveBeenCalled();
    console.info(`darkness map, switching pictures: ${mean(toggles)} ms`);
  });

  it('a token moving behind a wall from the darkness draws nothing', async () => {
    const { maps, sight, render } = await setUp(FAR);
    const all = redraws(maps, sight, sight.regions.length);
    expect(render).not.toHaveBeenCalled();
    console.info(`darkness map, tokens behind a wall, all moved: ${mean(all)} ms`);
  });

  it('a token moving beside the darkness draws it anew, once', async () => {
    const { maps, sight, render } = await setUp(NEAR);
    const one = redraws(maps, sight, 1);
    expect(render).toHaveBeenCalledTimes(STEPS);
    const all = redraws(maps, sight, sight.regions.length);
    console.info(`darkness map, tokens beside it: one moved ${mean(one)} ms, all moved ${mean(all)} ms`);
  });
});
