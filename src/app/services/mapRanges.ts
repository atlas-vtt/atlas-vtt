import type { App } from 'obsidian';
import { resolveMeasurementSettings } from '../grid/measurementFormat';
import { NO_MOVEMENT_RULES } from '../measure/movementRules';
import { rangesOffered } from '../measure/rangeRings';
import type { ViewAtlasState } from '../storeFactory';
import { mapMeasurementSettings } from './mapMeasurementSettings';
import { mapMovementRules } from './mapMovementRules';
import { rulesLookup } from './mapRules';

/**
 * Whether the map in `state` has rings for the measure tool's Ranges mode (`rangesOffered`): range
 * bands, or movement steps where it measures distances, by the rules it plays by. Without an app
 * to ask, by its own grid alone. Follow the rules with `onMapRulesChange`.
 */
export function mapOffersRanges(app: App | null | undefined, state: Pick<ViewAtlasState, 'mapPath' | 'grid'>): boolean {
  if (!app) return rangesOffered(resolveMeasurementSettings(undefined, state.grid), NO_MOVEMENT_RULES);
  return rangesOffered(mapMeasurementSettings(rulesLookup(app), state), mapMovementRules(app, state.mapPath));
}
