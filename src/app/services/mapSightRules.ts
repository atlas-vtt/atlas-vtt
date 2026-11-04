import type { App } from 'obsidian';
import { rulesForMap } from '../gameSystems/mapRules';
import type { ViewAtlasState } from '../storeFactory';
import type { SightRules } from '../vision/sightRules';
import { rulesLookup } from './mapRules';
import { mapSenseRules } from './mapSenseRules';

/**
 * What sight goes by for the map in `state`: the senses of the rules it plays by (the same list
 * statblock senses are read with, `mapSenseRules`) and their conditions; the generic senses and no
 * conditions for a map without rules. `visionOf` is how each token perceives, where that follows a
 * linked statblock.
 */
export function mapSightRules(app: App, state: Pick<ViewAtlasState, 'mapPath' | 'grid'>, visionOf?: SightRules['visionOf']): SightRules {
  const lookup = rulesLookup(app);
  return {
    definitions: mapSenseRules(app, lookup, state).definitions,
    conditions: rulesForMap(lookup, state.mapPath).settings?.conditions ?? [],
    ...(visionOf && { visionOf }),
  };
}
