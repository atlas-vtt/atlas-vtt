import { describe, expect, it } from 'vitest';
import type { MeasurementSettings } from '../../src/app/grid/measurementFormat';
import { LIGHT_PRESETS } from '../../src/app/lighting/lightPresets';
import { SceneModelBuilder, SceneSpots } from '../../src/app/vision/sceneModel';
import type { ViewAtlasState } from '../../src/app/storeFactory';
import type { TokenEntity } from '../../src/app/types';
import type { LightSource, LightZone } from '../../src/app/types/lightingTypes';
import { lightLevelAt } from '../../src/app/vision/lightLevels';

const BOUNDS = { width: 2000, height: 1200 };
const measurement = (): MeasurementSettings => ({ mode: 'grid', unitType: 'feet', unitDistance: 5, diagonalRule: 'chebyshev', rangeBands: [] }) as unknown as MeasurementSettings;
type SceneState = Parameters<SceneModelBuilder['update']>[0];
const rect = (x: number, y: number, w: number, h: number): { x: number; y: number }[] => [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }];
const CAVE: LightZone = { id: 'cave', kind: 'light-zone', polygon: rect(1000, 0, 1000, 1200), ambient: 0 };
const WALLS = {};
const NO_LIGHTS = {};
const NO_TOKENS = {};

function state(lightZones: Record<string, LightZone> | undefined, extra: { lights?: Record<string, LightSource>; tokens?: Record<string, TokenEntity>; ambient?: number } = {}): SceneState {
  const objects = { walls: WALLS, lights: extra.lights ?? NO_LIGHTS, tokens: extra.tokens ?? NO_TOKENS, ...(lightZones && { lightZones }) } as ViewAtlasState['objects'];
  return { objects, lighting: { enabled: true, ambient: extra.ambient ?? 1 }, grid: null, heldTokens: {} };
}

describe('ambient zones in the scene', () => {
  it('reach the picture and the rule as one list: the engine\'s zones with a soft edge of half a cell, and the ambient light the rule reads', () => {
    const zones = { cave: CAVE };
    const { model } = new SceneModelBuilder().update(state(zones), BOUNDS, measurement);
    expect(model.zones).toEqual([{ polygon: CAVE.polygon, ambient: 0, soft: 35 }]);
    expect(model.ambient.zones).toEqual([CAVE]);
    expect(lightLevelAt({ x: 1500, y: 600 }, model.ambient, model.reaches)).toBe('dark');
    expect(lightLevelAt({ x: 500, y: 600 }, model.ambient, model.reaches)).toBe('bright');
  });

  it('build the scene anew when a zone changes, and only then; a scene without zones has none and reads the scene\'s own lighting', () => {
    const builder = new SceneModelBuilder();
    const zones = { cave: CAVE };
    const first = builder.update(state(zones), BOUNDS, measurement);
    expect(builder.update(state(zones), BOUNDS, measurement).rebuilt).toBe(false);
    const moved = builder.update(state({ cave: { ...CAVE, ambient: 0.5 } }), BOUNDS, measurement);
    expect(moved.rebuilt).toBe(true);
    expect(moved.model.zones).not.toBe(first.model.zones);
    const plain = state(undefined);
    const none = builder.update(plain, BOUNDS, measurement);
    expect(none.model.zones).toEqual([]);
    expect(none.model.ambient).toBe(plain.lighting);
  });

  it('wake a lamp that follows the ambient light by the light of the zone it stands in', () => {
    const lamp = (x: number): LightSource => ({ id: `lamp${x}`, kind: 'light', x, y: 600, emission: LIGHT_PRESETS.torch.emission, activeBelowAmbient: 0.5 });
    const lights = { inside: lamp(1500), outside: lamp(500) };
    // By day the lamp in the cave burns, the one outside sleeps.
    expect(new SceneModelBuilder().update(state({ cave: CAVE }, { lights }), BOUNDS, measurement).model.lights.map((light) => light.key)).toEqual(['light:lamp1500']);
    // In a lit zone of a night scene it is the other way round.
    expect(new SceneModelBuilder().update(state({ cave: { ...CAVE, ambient: 1 } }, { lights, ambient: 0 }), BOUNDS, measurement).model.lights.map((light) => light.key)).toEqual(['light:lamp500']);
  });

  it('show a party token standing in a dark zone by day within its own space, and record the zone in what explored memory takes', () => {
    const hero: TokenEntity = { id: 'hero', kind: 'token', imagePath: 'h.png', x: 1500, y: 600, vision: { enabled: true } };
    const scene = state({ cave: CAVE }, { tokens: { hero } });
    const builder = new SceneModelBuilder();
    const { model } = builder.update(scene, BOUNDS, measurement);
    expect(new SceneSpots().update(model, scene, measurement)).toMatchObject([{ x: 1500, y: 600 }]);
    expect(model.explored?.ambient).toEqual({ base: true, zones: [{ polygon: CAVE.polygon, lit: false }] });
  });
});
