// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import type { MeasurementSettings } from '../../grid/measurementFormat';
import { SceneModelBuilder, SceneSpots, type SceneState } from '../sceneModel';
import type { MapBounds } from '../visibility';

/** Every renderer package is refused here, and each refusal noted: the scene model must ask for none. */
const { loaded, refuse } = vi.hoisted(() => {
  const loaded: string[] = [];
  return { loaded, refuse: (name: string) => (): never => { loaded.push(name); throw new Error(`${name} was loaded`); } };
});
vi.mock('pixi.js', refuse('pixi.js'));
vi.mock('pixi-viewport', refuse('pixi-viewport'));
vi.mock('pixi-filters', refuse('pixi-filters'));

const BOUNDS: MapBounds = { width: 600, height: 400 };
const MEASUREMENT: MeasurementSettings = { mode: 'metric', unitType: 'feet', unitDistance: 5, ruleDistance: 5, diagonalRule: 'equidistant', rangeBands: [], coneAngle: 90 };
const measurement = (): MeasurementSettings => MEASUREMENT;

/** A room with a wall down its middle: a scout carrying a torch on one side, a lamp and a lit hall on the other. */
const state: SceneState = {
  objects: {
    tokens: {
      scout: { id: 'scout', kind: 'token', imagePath: '', x: 100, y: 200, size: 1, vision: { enabled: true, range: 30 }, light: { bright: 10, dim: 20, color: '#ff8800', intensity: 1, animation: 'none' } },
    },
    walls: { divider: { id: 'divider', kind: 'wall', type: 'solid', p1: { x: 300, y: 0 }, p2: { x: 300, y: 400 } } },
    lights: { lamp: { id: 'lamp', kind: 'light', x: 450, y: 200, emission: { bright: 10, dim: 20, color: '#3366cc', intensity: 1, animation: 'none' } } },
    lightZones: { hall: { id: 'hall', kind: 'light-zone', ambient: 0.8, polygon: [{ x: 320, y: 20 }, { x: 580, y: 20 }, { x: 580, y: 120 }, { x: 320, y: 120 }] } },
  },
  lighting: { enabled: true, ambient: 0 },
  grid: { enabled: true, size: 70, offsetX: 0, offsetY: 0, opacity: 1 },
  heldTokens: {},
};

describe('the lighting scene model on its own', () => {
  it('builds a scene without a renderer, a store or a document', () => {
    const builder = new SceneModelBuilder();
    const first = builder.update(state, BOUNDS, measurement);
    expect(first.rebuilt).toBe(true);
    expect(first.model.lights.map((light) => [light.key, light.color])).toEqual([
      ['light:lamp', [0.318546779864347, 0.44798841668593997, 0.787412301190406]],
      ['token:scout', [1, 0.5488627027469221, 0.21404114048223255]],
    ]);
    expect(first.model.reaches).toHaveLength(2);
    expect(first.model.sight.regions.map((region) => region.tokenId)).toEqual(['scout']);
    expect(first.model.zones).toHaveLength(1);
    expect(first.model.walls[0]).toBe(state.objects.walls.divider);

    const again = builder.update(state, BOUNDS, measurement);
    expect(again).toEqual({ model: first.model, rebuilt: false });
    expect(again.model).toBe(first.model);

    const scout = state.objects.tokens.scout!;
    const moved: SceneState = { ...state, objects: { ...state.objects, tokens: { scout: { ...scout, x: 150 } } } };
    const next = builder.update(moved, BOUNDS, measurement);
    expect(next.rebuilt).toBe(true);
    expect(next.model.sight.regions[0]!.origin).toEqual({ x: 150, y: 200 });

    // With no light anywhere, the scout is shown within its own footprint.
    const dark: SceneState = { ...state, objects: { tokens: { scout: { id: 'scout', kind: 'token', imagePath: '', x: 100, y: 200, size: 1, vision: { enabled: true, range: 30 } } }, walls: state.objects.walls, lights: {} } };
    const unlit = builder.update(dark, BOUNDS, measurement).model;
    expect(unlit.lights).toEqual([]);
    expect(new SceneSpots().update(unlit, dark, measurement).map(({ x, y }) => ({ x, y }))).toEqual([{ x: 100, y: 200 }]);

    expect(loaded).toEqual([]);
    expect(typeof document).toBe('undefined');
  });

  it('cannot load the scene model that read colours through the renderer', async () => {
    await expect(import('../../../../tests/oracles/sceneModelBaseline/sceneModel')).rejects.toThrow();
    expect(loaded).toEqual(['pixi.js']);
  });
});
