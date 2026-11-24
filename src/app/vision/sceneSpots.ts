import type { MeasurementSettings } from '../grid/measurementFormat';
import { withZones } from '../lighting/lightZones';
import { unitScaleOf } from '../lighting/lightingUnits';
import { heldForSight } from '../lighting/sightOnDrop';
import { levelObjects } from '../levels/levelObjects';
import { mapTokens } from '../tokens/offMap';
import type { TokenEntity } from '../types';
import type { SceneLighting } from '../types/lightingTypes';
import type { ViewState } from '../types/viewState';
import type { HeldTokens } from '../types/viewUIState';
import { perceptionOptions, seenSpots, type SeenSpot } from './perception';
import type { SceneModel, SceneState } from './sceneModel';
import type { Sight } from './sight';
import type { SightRules } from './sightRules';
import { PLAYER_SIGHT_POLICY, type SightPolicy } from './tokenSightPolicy';

interface SpotInputs {
  sight: Sight;
  model: SceneModel;
  tokens: Record<string, TokenEntity>;
  held: HeldTokens;
  lighting: SceneLighting;
  grid: ViewState['grid'];
  rules: SightRules | undefined;
}

/**
 * The tokens shown within their footprint where the picture of `policy` (unset, the players') is
 * dark (`seenSpots`). They are read where the store has them, not where a drag began: a party token
 * dragged through the dark is shown along the way, as far as the sight that stayed behind reaches.
 * Worked out only when the model, the tokens, the held tokens, the lighting or the rules change, and
 * the same list is returned while its spots stay the same, so a view that compares lists draws nothing anew.
 */
export class SceneSpots {
  private inputs: SpotInputs | null = null;
  private spots: SeenSpot[] = [];

  constructor(private readonly policy: SightPolicy = PLAYER_SIGHT_POLICY) {}

  update(model: SceneModel, state: SceneState, measurement: () => MeasurementSettings, sightRules?: () => SightRules, sight: Sight = model.sight): SeenSpot[] {
    const inputs: SpotInputs = { sight, model, tokens: mapTokens(levelObjects(state)), held: heldForSight(state), lighting: state.lighting, grid: state.grid, rules: sightRules?.() };
    const last = this.inputs;
    this.inputs = inputs;
    if (last && (Object.keys(inputs) as (keyof SpotInputs)[]).every((key) => last[key] === inputs[key])) return this.spots;
    const { cellSize } = unitScaleOf(measurement(), state.grid);
    const spots = seenSpots(sight, withZones(state.lighting, model.ambient.zones ?? []), model.reaches, inputs.tokens, cellSize, model.walls, perceptionOptions(inputs.rules, inputs.held, this.policy));
    // The footprints are cut by the walls: with other walls they are other footprints at the same places.
    if (last?.model.walls !== model.walls || !sameSpots(spots, this.spots)) this.spots = spots;
    return this.spots;
  }
}

function sameSpots(a: readonly SeenSpot[], b: readonly SeenSpot[]): boolean {
  return a.length === b.length && a.every((spot, i) => spot.x === b[i]!.x && spot.y === b[i]!.y && spot.radius === b[i]!.radius);
}
