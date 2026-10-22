import { fogCoverage } from '../../../../src/app/fog/fogCoverage';
import { resolveMeasurementSettings } from '../../../../src/app/grid/measurementFormat';
import { heldForSight } from '../../../../src/app/lighting/sightOnDrop';
import type { Perception, SeenSpot } from '../../../../src/app/vision/perception';
import { SceneModelBuilder, SceneSpots, type SceneModel, type SceneState as ModelState } from '../../../../src/app/vision/sceneModel';
import { GENERIC_SIGHT_RULES } from '../../../../src/app/vision/sightRules';
import { tokenPerception } from '../../../../src/app/vision/tokenPerception';
import type { MapBounds } from '../../../../src/app/vision/visibility';
import type { AtlasPlayerSettings, LightingSource } from '../../../../src/app/online/gm/atlasLighting.ts';
import type { SceneState } from '../../../../src/app/online/gm/atlasView.ts';

/** A GM whose lighting reads the generic senses, no conditions and five feet a cell. */
export const GENERIC_SOURCE: LightingSource = { rules: () => GENERIC_SIGHT_RULES, measurement: () => resolveMeasurementSettings(undefined, null) };

/** Atlas's player view settings with token names shown to players. */
export const PLAYER_SETTINGS: AtlasPlayerSettings = { showNames: true, showDiceRolls: false, showInitiative: true, showWidgets: true, showCursors: false };

/** The GM's lighting of a scene as Atlas's renderer works it out: the model and the players' footprints. */
export function gmModel(state: ModelState, source: LightingSource, bounds: MapBounds): { readonly model: SceneModel; readonly spots: SeenSpot[] } {
  const rules = (): ReturnType<LightingSource['rules']> => source.rules();
  const { model } = new SceneModelBuilder().update(state, bounds, () => source.measurement(), rules);
  return { model, spots: new SceneSpots().update(model, state, () => source.measurement(), rules) };
}

/**
 * How the players' frame perceives each token, as `playerRollTokens` asks it: the lighting's
 * perception on a lit scene, then committed fog over the token's centre (fog that cannot be read
 * hides every token).
 */
export function gmPerception(state: SceneState, source: LightingSource, bounds: MapBounds): (tokenId: string) => Perception {
  let coverage: ReturnType<typeof fogCoverage> | null;
  try {
    coverage = fogCoverage(state.objects.fog);
  } catch {
    coverage = null;
  }
  const { tokens } = state.objects;
  const lit = state.lighting.enabled ? gmModel(state, source, bounds).model : null;
  const sight = lit === null ? undefined : tokenPerception(lit.sight, lit.ambient, lit.reaches, tokens, { conditions: source.rules().conditions, held: heldForSight(state) });
  return (id) => {
    const token = tokens[id];
    if (token === undefined || coverage === null || coverage.covers(token)) return 'unseen';
    return sight?.(id) ?? 'seen';
  };
}
