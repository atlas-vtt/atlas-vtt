import { describe, expect, it } from 'vitest';
import type { MeasurementSettings } from '../../src/app/grid/measurementFormat';
import { SceneModelBuilder, SceneSpots } from '../../src/app/vision/sceneModel';
import type { ViewAtlasState } from '../../src/app/storeFactory';
import type { TokenEntity } from '../../src/app/types';
import type { SceneLighting } from '../../src/app/types/lightingTypes';

const BOUNDS = { width: 1000, height: 600 };
const measurement = (): MeasurementSettings => ({ mode: 'grid', unitType: 'feet', unitDistance: 5, diagonalRule: 'chebyshev', rangeBands: [] }) as unknown as MeasurementSettings;
type SceneState = Parameters<SceneModelBuilder['update']>[0];

const hero: TokenEntity = { id: 'hero', kind: 'token', imagePath: 'h.png', x: 200, y: 300, vision: { enabled: true, range: 20 } };
const DARK: SceneLighting = { enabled: true, ambient: 0 };
const WALLS = {};
const LIGHTS = {};

function state(tokens: Record<string, TokenEntity>, extra: Partial<Pick<ViewAtlasState, 'lighting' | 'heldTokens'>> = {}): SceneState {
  return { objects: { walls: WALLS, lights: LIGHTS, tokens } as ViewAtlasState['objects'], lighting: DARK, grid: null, heldTokens: {}, ...extra };
}

describe('SceneSpots', () => {
  function rig(): { spotsOf: (next: SceneState) => { x: number; y: number }[] } {
    const builder = new SceneModelBuilder();
    const spots = new SceneSpots();
    return { spotsOf: (next) => spots.update(builder.update(next, BOUNDS, measurement).model, next, measurement) };
  }

  it('shows a party token in the dark within its footprint, and returns the same list while nothing changes', () => {
    const { spotsOf } = rig();
    const first = state({ hero });
    const spots = spotsOf(first);
    expect(spots).toMatchObject([{ x: 200, y: 300, radius: 31 }]);
    expect(spotsOf(first)).toBe(spots);
    expect(spotsOf({ ...first })).toBe(spots);
    expect(spotsOf(state({ hero: { ...hero } }))).toBe(spots);
  });

  it('follows the scene: none in light, one again in the dark', () => {
    const { spotsOf } = rig();
    expect(spotsOf(state({ hero }, { lighting: { enabled: true, ambient: 1 } }))).toEqual([]);
    expect(spotsOf(state({ hero }))).toHaveLength(1);
    expect(spotsOf(state({ hero: { ...hero, x: 400 } }))).toMatchObject([{ x: 400, y: 300, radius: 31 }]);
  });

  it('follows a dragged party token while the model stays as it was, as far as the sight left behind reaches, where the scene waits for the drop', () => {
    const builder = new SceneModelBuilder();
    const spots = new SceneSpots();
    const held = { hero: { x: 200, y: 300 } };
    const at = (x: number): SceneState => state({ hero: { ...hero, x } }, { heldTokens: held, lighting: { ...DARK, sightOnDrop: true } });
    const start = builder.update(at(200), BOUNDS, measurement);
    expect(spots.update(start.model, at(200), measurement)).toMatchObject([{ x: 200, y: 300, radius: 31 }]);
    // The hero sees 20 ft, 280 px: 150 px away it is still within the sight that stayed behind.
    const near = at(350);
    const moved = builder.update(near, BOUNDS, measurement);
    expect(moved.rebuilt).toBe(false);
    expect(spots.update(moved.model, near, measurement)).toMatchObject([{ x: 350, y: 300, radius: 31 }]);
    const far = at(700);
    expect(spots.update(builder.update(far, BOUNDS, measurement).model, far, measurement)).toEqual([]);
    const dropped = state({ hero: { ...hero, x: 700 } });
    expect(spots.update(builder.update(dropped, BOUNDS, measurement).model, dropped, measurement)).toMatchObject([{ x: 700, y: 300, radius: 31 }]);
  });

  it('follows it at once unless the scene waits for the drop', () => {
    const builder = new SceneModelBuilder();
    const spots = new SceneSpots();
    const far = state({ hero: { ...hero, x: 700 } }, { heldTokens: { hero: { x: 200, y: 300 } } });
    expect(spots.update(builder.update(far, BOUNDS, measurement).model, far, measurement)).toMatchObject([{ x: 700, y: 300, radius: 31 }]);
  });
});
