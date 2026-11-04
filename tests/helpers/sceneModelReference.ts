import type { WebGLRenderer } from 'pixi.js';
import { sceneLook } from '../../src/app/lighting/sceneLightingOptions';
import { LightingEngine } from '../../src/app/pixi/lighting/engine/LightingEngine';
import type { EngineLight } from '../../src/app/pixi/lighting/engine/types';
import type { ViewAtlasState } from '../../src/app/storeFactory';
import type { Sight } from '../../src/app/vision/sight';
import type { SightRules } from '../../src/app/vision/sightRules';
import { frozen } from './sceneModelFrozen';
import { BOUNDS, MEASUREMENT } from './tableSightScene';

const DEFAULT_CELL_SIZE = 70;

export interface SceneModelReference {
  engine: LightingEngine;
  /** The players' sight of the frozen model. */
  sight: Sight;
}

/**
 * The scene as the frozen scene model builds it, drawn by today's engine. The composition is
 * copied from `LightingRenderer.update` and `takeModel` at c246011fe636672a3865b52bf6f43a9138355085
 * (src/app/pixi/lighting/LightingRenderer.ts:222-228, 233-240), without explored memory.
 * `relit` changes the lights the engine is given, for a control.
 */
export function sceneModelReference(renderer: WebGLRenderer, state: ViewAtlasState, rules?: SightRules, relit: (lights: EngineLight[]) => EngineLight[] = (lights) => lights): SceneModelReference {
  const measurement = (): typeof MEASUREMENT => MEASUREMENT;
  const rulesOf = rules ? (): SightRules => rules : undefined;
  const { model } = frozen.builder().update(state, BOUNDS, measurement, rulesOf);
  const spots = frozen.spots('players').update(model, state, measurement, rulesOf);
  const gmSight = model.gmSight ?? model.sight;
  const gmSpots = gmSight === model.sight ? spots : frozen.spots('GM').update(model, state, measurement, rulesOf, gmSight);
  const base = { bounds: BOUNDS, albedo: null, walls: model.walls, lights: relit(model.lights), sight: gmSight, sightRadius: (state.grid?.size ?? DEFAULT_CELL_SIZE) * 0.5, zones: model.zones };
  const engine = new LightingEngine(renderer);
  engine.setEnabled(true);
  engine.update({ ...base, spots: gmSpots, ...(gmSight !== model.sight && { playerSight: model.sight, playerSpots: spots }), ...sceneLook(state.lighting) });
  engine.flush();
  return { engine, sight: model.sight };
}
