import { LightingEngine } from '../oracles/tableSightBaseline/LightingEngine';
import { SceneModelBuilder, SceneSpots } from '../oracles/tableSightBaseline/sceneModel';
import { sceneLook } from '../../src/app/lighting/sceneLightingOptions';
import type { ViewAtlasState } from '../../src/app/storeFactory';
import type { SightRules } from '../../src/app/vision/sightRules';
import type { WebGLRenderer } from 'pixi.js';
import { BOUNDS, MEASUREMENT } from './tableSightScene';

/** Pre-change model and engine, with the same real scene inputs and no recorded memory. */
export function referenceEngine(renderer: WebGLRenderer, state: ViewAtlasState, rules?: SightRules): LightingEngine {
  const model = new SceneModelBuilder().update(state, BOUNDS, () => MEASUREMENT, rules ? () => rules : undefined).model;
  const spots = new SceneSpots().update(model, state, () => MEASUREMENT, rules ? () => rules : undefined);
  const engine = new LightingEngine(renderer);
  engine.setEnabled(true);
  engine.setMode('gm');
  engine.update({
    bounds: BOUNDS, albedo: null, walls: model.walls, lights: model.lights, sight: model.sight,
    sightRadius: (state.grid?.size ?? 70) * 0.5, spots, zones: model.zones, ...sceneLook(state.lighting),
  });
  engine.flush();
  return engine;
}
