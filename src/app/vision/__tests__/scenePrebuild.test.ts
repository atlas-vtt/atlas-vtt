import { describe, expect, it, vi } from 'vitest';
import type { MeasurementSettings } from '../../grid/measurementFormat';
import type { WallSegment } from '../../types/wallTypes';
import { SceneModelBuilder, type SceneState } from '../sceneModel';
import { prebuildScene, type PrebuildRequest } from '../prebuild/scenePrebuild';
import { assemblePrebuild, splitPrebuild, type PrebuiltScene } from '../prebuild/prebuildParts';
import { packWalls, unpackWalls } from '../prebuild/wallCodec';
import type { MapBounds } from '../visibility';

/** Every sweep is counted, so a build that takes what a prebuild traced can be seen to sweep nothing. */
const sweeps = vi.hoisted(() => ({ count: 0 }));
vi.mock('../visibility', async (original) => {
  const actual = await original<typeof import('../visibility')>();
  return { ...actual, computeVisibility: (...args: Parameters<typeof actual.computeVisibility>) => { sweeps.count++; return actual.computeVisibility(...args); } };
});

const BOUNDS: MapBounds = { width: 1400, height: 1000 };
const MEASUREMENT: MeasurementSettings = { mode: 'metric', unitType: 'feet', unitDistance: 5, ruleDistance: 5, diagonalRule: 'equidistant', rangeBands: [], coneAngle: 90 };
const measurement = (): MeasurementSettings => MEASUREMENT;

function wall(id: string, x1: number, y1: number, x2: number, y2: number, extra: Partial<WallSegment> = {}): WallSegment {
  return { id, kind: 'wall', type: 'solid', p1: { x: x1, y: y1 }, p2: { x: x2, y: y2 }, ...extra };
}

/** Rooms with gaps the sealing closes, doors, glass, a one-way wall; lights of every kind; tokens that see. */
function scene(): SceneState {
  const walls: WallSegment[] = [
    wall('a', 300, 0, 300, 450), wall('b', 302, 470, 300, 1000), wall('c', 300, 500, 800, 503),
    wall('d', 800, 0, 800, 300, { type: 'door', closed: false }), wall('e', 800, 300, 800, 700, { blocks: 'light' }),
    wall('f', 900, 600, 1300, 650, { direction: 'left', chainId: 'k' }), wall('g', 1000, 100, 1200, 300, { blocks: 'sight', levels: 'all' }),
  ];
  return {
    objects: {
      tokens: {
        scout: { id: 'scout', kind: 'token', imagePath: '', x: 150, y: 200, size: 1, vision: { enabled: true, range: 60 }, light: { bright: 10, dim: 20, color: '#ff8800', intensity: 1, animation: 'none' } },
        watcher: { id: 'watcher', kind: 'token', imagePath: '', x: 600, y: 750, size: 2, rotation: 45, vision: { enabled: true, angle: 90 } },
        guard: { id: 'guard', kind: 'token', imagePath: '', x: 1100, y: 800, size: 1 },
      },
      walls: Object.fromEntries(walls.map((w) => [w.id, w])),
      lights: {
        lamp: { id: 'lamp', kind: 'light', x: 500, y: 250, emission: { bright: 10, dim: 25, color: '#3366cc', intensity: 1, animation: 'none' } },
        beam: { id: 'beam', kind: 'light', x: 1000, y: 400, rotation: 120, emission: { bright: 15, dim: 30, color: '#ffffff', intensity: 1, animation: 'none', angle: 60 } },
        lava: { id: 'lava', kind: 'light', x: 450, y: 850, area: [{ x: 400, y: 800 }, { x: 520, y: 810 }, { x: 480, y: 900 }], emission: { bright: 5, dim: 15, color: '#ff4400', intensity: 1, animation: 'none' } },
        dark: { id: 'dark', kind: 'light', x: 1150, y: 850, emission: { bright: 0, dim: 10, color: '#000000', intensity: 1, animation: 'none', darkness: true } },
      },
    },
    lighting: { enabled: true, ambient: 0.1 },
    grid: { enabled: true, size: 70, offsetX: 0, offsetY: 0, opacity: 1 },
    heldTokens: {},
  };
}

/** What workers would answer, `count` of them: each part and its reply cloned as a message clones them; `failing` parts answer nothing. */
const workers = (count: number, failing: number[] = []) => (request: PrebuildRequest): Promise<PrebuiltScene | null> => {
  const split = splitPrebuild(request, count);
  const replies = split.parts.map((part, i) => (failing.includes(i) ? null : structuredClone(prebuildScene(structuredClone(part)))));
  return Promise.resolve(assemblePrebuild(request, split, replies));
};
const worker = workers(1);

describe('tracing a scene ahead of its build', () => {
  it('carries walls with every field they have', () => {
    const walls = Object.values(scene().objects.walls);
    expect(unpackWalls(structuredClone(packWalls(walls)!))).toEqual(walls);
    expect(packWalls([wall('x', 0, 0, 1, 1, { closed: 'yes' as unknown as boolean })])).toBeNull();
  });

  it('builds exactly the model a build of its own makes, and sweeps nothing for it', async () => {
    const expected = new SceneModelBuilder().update(scene(), BOUNDS, measurement).model;
    const state = scene();
    const builder = new SceneModelBuilder({ prebuildMinWork: 0 });
    await builder.prepare(state, BOUNDS, measurement, undefined, BOUNDS, worker);
    sweeps.count = 0;
    const { model } = builder.update(state, BOUNDS, measurement);
    expect(sweeps.count).toBe(0);
    expect(JSON.stringify(model)).toBe(JSON.stringify(expected));
    expect(model.reaches.find((reach) => reach.parts)?.polygon).toBe(model.lights.find((light) => light.surface)?.surface);
  });

  it.each([2, 3, 9])('builds the same model from the traces of %i workers', async (count) => {
    const expected = new SceneModelBuilder().update(scene(), BOUNDS, measurement).model;
    const state = scene();
    const builder = new SceneModelBuilder({ prebuildMinWork: 0 });
    await builder.prepare(state, BOUNDS, measurement, undefined, BOUNDS, workers(count));
    sweeps.count = 0;
    const { model } = builder.update(state, BOUNDS, measurement);
    expect(sweeps.count).toBe(0);
    expect(JSON.stringify(model)).toBe(JSON.stringify(expected));
  });

  it('traces on the main thread what a failed worker owed', async () => {
    const state = scene();
    const builder = new SceneModelBuilder({ prebuildMinWork: 0 });
    await builder.prepare(state, BOUNDS, measurement, undefined, BOUNDS, workers(3, [0]));
    expect(JSON.stringify(builder.update(state, BOUNDS, measurement).model)).toBe(JSON.stringify(new SceneModelBuilder().update(scene(), BOUNDS, measurement).model));
  });

  it('traces anew what changed since the prebuild', async () => {
    const state = scene();
    const builder = new SceneModelBuilder({ prebuildMinWork: 0 });
    await builder.prepare(state, BOUNDS, measurement, undefined, BOUNDS, worker);
    const scout = state.objects.tokens.scout!;
    const moved: SceneState = { ...state, objects: { ...state.objects, tokens: { ...state.objects.tokens, scout: { ...scout, x: 160 } } } };
    sweeps.count = 0;
    const { model } = builder.update(moved, BOUNDS, measurement);
    expect(sweeps.count).toBeGreaterThan(0);
    expect(JSON.stringify(model)).toBe(JSON.stringify(new SceneModelBuilder().update(moved, BOUNDS, measurement).model));
  });

  it('asks nothing of the workers for walls whose traces it holds, as a scene switched back to', async () => {
    const state = scene();
    const builder = new SceneModelBuilder({ prebuildMinWork: 0 });
    builder.update(state, BOUNDS, measurement);
    const compute = vi.fn(worker);
    await builder.prepare(state, BOUNDS, measurement, undefined, BOUNDS, compute);
    expect(compute).not.toHaveBeenCalled();
  });

  it('leaves a scene traced in moments to its build', async () => {
    const compute = vi.fn(worker);
    await new SceneModelBuilder().prepare(scene(), BOUNDS, measurement, undefined, BOUNDS, compute);
    expect(compute).not.toHaveBeenCalled();
  });

  it('builds as ever where no prebuild answers', async () => {
    const builder = new SceneModelBuilder({ prebuildMinWork: 0 });
    await builder.prepare(scene(), BOUNDS, measurement, undefined, BOUNDS, () => Promise.resolve(null));
    expect(JSON.stringify(builder.update(scene(), BOUNDS, measurement).model)).toBe(JSON.stringify(new SceneModelBuilder().update(scene(), BOUNDS, measurement).model));
  });
});
