import { describe, expect, it } from 'vitest';
import type { MeasurementSettings } from '../../src/app/grid/measurementFormat';
import { LIGHT_PRESETS } from '../../src/app/lighting/lightPresets';
import { SceneModelBuilder } from '../../src/app/vision/sceneModel';
import type { ViewAtlasState } from '../../src/app/storeFactory';
import type { LightSource } from '../../src/app/types/lightingTypes';
import { lightLevelAt } from '../../src/app/vision/lightLevels';

const BOUNDS = { width: 1000, height: 600 };
const measurement = (): MeasurementSettings => ({ mode: 'grid', unitType: 'feet', unitDistance: 5, diagonalRule: 'chebyshev', rangeBands: [] }) as unknown as MeasurementSettings;
type SceneState = Parameters<SceneModelBuilder['update']>[0];
const torch = LIGHT_PRESETS.torch.emission;
const WALLS = {};
const TOKENS = {};

function state(lights: Record<string, LightSource>, ambient: number): SceneState {
  return { objects: { walls: WALLS, lights, tokens: TOKENS } as ViewAtlasState['objects'], lighting: { enabled: true, ambient }, grid: null, heldTokens: {} };
}

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

describe('lights that follow the ambient light, in the scene', () => {
  const LIGHTS: Record<string, LightSource> = {
    lamp: { id: 'lamp', kind: 'light', x: 300, y: 300, emission: torch, activeBelowAmbient: 0.5 },
    torch: { id: 'torch', kind: 'light', x: 800, y: 300, emission: torch },
  };

  it('are left out of the picture and of the rule alike while the scene is brighter than their level', () => {
    const builder = new SceneModelBuilder();
    const day = builder.update(state(LIGHTS, 0.6), BOUNDS, measurement).model;
    expect(day.lights.map((light) => light.key)).toEqual(['light:torch']);
    expect(day.reaches).toHaveLength(1);
    // 0.6 is dim ambient light: at the lamp the scene is dim, not bright as under it at night.
    expect(lightLevelAt({ x: 300, y: 300 }, { ambient: 0.6 }, day.reaches)).toBe('dim');
    const dusk = builder.update(state(LIGHTS, 0.5), BOUNDS, measurement);
    expect(dusk.rebuilt).toBe(true);
    expect(dusk.model.lights.map((light) => light.key)).toEqual(['light:lamp', 'light:torch']);
    expect(dusk.model.reaches).toHaveLength(2);
    expect(lightLevelAt({ x: 300, y: 300 }, { ambient: 0.5 }, dusk.model.reaches)).toBe('bright');
  });

  it('build nothing anew while the ambient light changes without crossing a level', () => {
    const builder = new SceneModelBuilder();
    builder.update(state(LIGHTS, 0.6), BOUNDS, measurement);
    // 0.6 and 0.7 are both dim, and both above the lamp's level.
    expect(builder.update(state(LIGHTS, 0.7), BOUNDS, measurement).rebuilt).toBe(false);
    expect(builder.update(state(LIGHTS, 0.45), BOUNDS, measurement).rebuilt).toBe(true);
    expect(builder.update(state(LIGHTS, 0.4), BOUNDS, measurement).rebuilt).toBe(false);
  });

  it('are the same after any run of ambient changes as when the scene is built at once (fuzz)', () => {
    const rand = rng(7);
    for (let scene = 0; scene < 40; scene++) {
      const lights: Record<string, LightSource> = {};
      for (let i = 0; i < 1 + Math.floor(rand() * 5); i++) {
        lights[`l${i}`] = { id: `l${i}`, kind: 'light', x: rand() * 1000, y: rand() * 600, emission: torch, ...(rand() < 0.7 && { activeBelowAmbient: Math.round(rand() * 100) / 100 }), ...(rand() < 0.15 && { hidden: true }) };
      }
      const builder = new SceneModelBuilder();
      for (let step = 0; step < 12; step++) {
        const ambient = Math.round(rand() * 100) / 100;
        const kept = builder.update(state(lights, ambient), BOUNDS, measurement).model;
        const fresh = new SceneModelBuilder().update(state(lights, ambient), BOUNDS, measurement).model;
        const expected = Object.values(lights).filter((light) => !light.hidden && (light.activeBelowAmbient === undefined || ambient <= light.activeBelowAmbient)).map((light) => `light:${light.id}`);
        expect(fresh.lights.map((light) => light.key)).toEqual(expected);
        expect(kept.lights.map((light) => light.key)).toEqual(expected);
        expect(kept.reaches.map((reach) => reach.origin)).toEqual(fresh.reaches.map((reach) => reach.origin));
      }
    }
  });
});
