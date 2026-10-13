import type { WebGLRenderer } from 'pixi.js';
import { sceneLook } from '../../src/app/lighting/sceneLightingOptions';
import { LightingEngine } from '../../src/app/pixi/lighting/engine/LightingEngine';
import type { ViewAtlasState } from '../../src/app/storeFactory';
import type { SightRules } from '../../src/app/vision/sightRules';
import { SceneModelBuilder, SceneSpots } from '../oracles/sightPolicyBaseline/sceneModel';
import type { Sight } from '../oracles/sightPolicyBaseline/sight';
import { BOUNDS, MEASUREMENT } from './tableSightScene';

const DEFAULT_CELL_SIZE = 70;

export interface SightPolicyReference {
  engine: LightingEngine;
  /** The players' sight of the frozen model. */
  sight: Sight;
}

/**
 * The scene as the frozen sight rules build it, drawn by today's engine. The composition is
 * copied from `LightingRenderer.update` and `takeModel` at 8b3ddf049d7ad45e70beac62500d80e8bead30fd
 * (src/app/pixi/lighting/LightingRenderer.ts:214-219, 224-230), without explored memory.
 * `playersFootprintsForGm` hands the GM's frame the players' footprints instead of its own.
 */
export function sightPolicyReference(renderer: WebGLRenderer, state: ViewAtlasState, rules?: SightRules, playersFootprintsForGm = false): SightPolicyReference {
  const measurement = (): typeof MEASUREMENT => MEASUREMENT;
  const rulesOf = rules ? (): SightRules => rules : undefined;
  const { model } = new SceneModelBuilder().update(state, BOUNDS, measurement, rulesOf);
  const spots = new SceneSpots().update(model, state, measurement, rulesOf);
  const gmSight = model.gmSight ?? model.sight;
  const gmSpots = gmSight === model.sight ? spots : new SceneSpots().update(model, state, measurement, rulesOf, gmSight);
  const base = { bounds: BOUNDS, albedo: null, walls: model.walls, lights: model.lights, sight: gmSight, sightRadius: (state.grid?.size ?? DEFAULT_CELL_SIZE) * 0.5, zones: model.zones };
  const engine = new LightingEngine(renderer);
  engine.setEnabled(true);
  engine.update({ ...base, spots: playersFootprintsForGm ? spots : gmSpots, ...(gmSight !== model.sight && { playerSight: model.sight, playerSpots: spots }), ...sceneLook(state.lighting) });
  engine.flush();
  return { engine, sight: model.sight };
}
