import type { App } from 'obsidian';
import { unitChange } from '../gameSystems/mapUnitChange';
import type { ViewAtlasState } from '../storeFactory';
import type { GridUnitType } from '../types/collectionSettingsTypes';
import { mapRules, updateMapRules } from './mapRules';

/**
 * Measures the store's map in `unitType` where its rules come from (`unitChange`): the played
 * campaign's system, else the map's collection, else its own grid, an undo step of the scene.
 */
export async function setMapUnitType(
  app: App,
  store: { getState(): Pick<ViewAtlasState, 'mapPath' | 'grid' | 'setGrid'> },
  unitType: GridUnitType,
): Promise<void> {
  const state = store.getState();
  const change = unitChange(mapRules(app, state.mapPath), state.grid, unitType);
  if (change?.kind === 'grid') state.setGrid(change.grid);
  else if (change) await updateMapRules(app, change.source, { gridDefaults: change.gridDefaults });
}
