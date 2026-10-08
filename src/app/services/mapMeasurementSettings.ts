import { DEFAULT_CONE_ANGLE, isValidConeAngle, resolveMeasurementSettings, type MeasurementSettings } from '../grid/measurementFormat';
import { collectionConeAngle } from '../gameSystems/coneAngle';
import type { ViewAtlasState } from '../storeFactory';
import type { CollectionSettings } from '../types/collectionSettingsTypes';
import type { AssetService } from './AssetService';

/** The settings of the collection holding the map at `mapPath`; null for a map outside a collection. */
export function collectionSettingsFor(assetService: AssetService, mapPath: string | null): CollectionSettings | null {
  const collectionId = mapPath ? assetService.getCollectionForMap(mapPath) : null;
  return collectionId ? assetService.getCollectionSettings(collectionId) : null;
}

/**
 * The cone angle the map at `mapPath` measures with, for the GM's measure tool and for every
 * other view alike, so the two never differ: its collection's (`collectionConeAngle`: its own,
 * else its system's, with or without grid defaults), a quarter circle outside a collection or
 * for a stored angle no cone can open with (one edited by hand).
 */
export function mapConeAngle(assetService: AssetService, mapPath: string | null): number {
  const settings = collectionSettingsFor(assetService, mapPath);
  if (!settings) return DEFAULT_CONE_ANGLE;
  const angle = collectionConeAngle(settings.gridDefaults, settings.systemPresetId);
  return isValidConeAngle(angle) ? angle : DEFAULT_CONE_ANGLE;
}

/** Measurement settings for the map in `state`: its collection's, or, in the remote view, its owner's. */
export function mapMeasurementSettings(
  assetService: AssetService,
  state: Pick<ViewAtlasState, 'mapPath' | 'grid'> & Partial<Pick<ViewAtlasState, 'remoteView'>>,
): MeasurementSettings {
  if (state.remoteView) return state.remoteView.measurement;
  const settings = collectionSettingsFor(assetService, state.mapPath);
  if (!settings) return resolveMeasurementSettings(undefined, state.grid);
  return { ...resolveMeasurementSettings(settings.gridDefaults, state.grid), coneAngle: mapConeAngle(assetService, state.mapPath) };
}
