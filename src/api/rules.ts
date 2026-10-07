import type { App } from 'obsidian';
import { resolveMeasurementSettings } from '../app/grid/measurementFormat';
import { mapResources } from '../app/resources/collectionResources';
import { AssetService } from '../app/services/AssetService';
import { mapDiceRules } from '../app/services/mapDiceRules';
import { mapInitiativeRules } from '../app/services/mapInitiativeRules';
import { collectionSettingsFor, mapConeAngle } from '../app/services/mapMeasurementSettings';
import { SystemPresetFiles } from '../app/services/systemPresets/SystemPresetFiles';
import type { ApiEvents } from './events';
import { frozenCopy } from './frozen';
import type { MapRules, RulesApi } from './types/rules';

/** A deep-frozen copy: nothing in it is Atlas's own state. */
export function mapRules(app: App, mapPath: string | null): MapRules {
  const assets = AssetService.getInstance(app);
  const settings = collectionSettingsFor(assets, mapPath);
  const gridDefaults = settings?.gridDefaults ?? null;
  return frozenCopy<MapRules>({
    collectionId: mapPath ? assets.getCollectionForMap(mapPath) : null,
    gridDefaults,
    measurement: { ...resolveMeasurementSettings(settings?.gridDefaults, null), coneAngle: mapConeAngle(assets, mapPath) },
    resources: mapResources(assets, mapPath),
    conditions: settings?.conditions ?? [],
    initiative: mapInitiativeRules(app, mapPath),
    dice: mapDiceRules(app, mapPath),
  });
}

export function rulesApi(app: App): RulesApi {
  return Object.freeze({ forMap: (mapPath: string | null): MapRules => mapRules(app, mapPath) });
}

/**
 * `rules-changed` for collection settings saves (with the collection id) and for edits of the user's system
 * presets (null: any collection may differ). Returns the stop.
 *
 * With `indexSettled` false it also reports (null) once the asset index has loaded, and logs a failed load;
 * the publisher passes true, having awaited the index itself, so nothing retries a failed load.
 */
export function watchRules(app: App, events: ApiEvents, indexSettled = false): () => void {
  let live = true;
  const ref = app.workspace.on('atlas-vtt:collection-settings-changed', (collectionId: string) => {
    if (live) events.emit('rules-changed', collectionId ?? null);
  });
  // The user's presets are vault files: a save, rename or delete here or on another device.
  const stopPresets = SystemPresetFiles.forApp(app)?.onChange(() => {
    if (live) events.emit('rules-changed', null);
  });
  if (!indexSettled) {
    AssetService.getInstance(app).initialize().then(
      () => { if (live) events.emit('rules-changed', null); },
      (error: unknown) => { console.error('[Atlas API] The asset index failed to load:', error); },
    );
  }
  return (): void => {
    live = false;
    app.workspace.offref(ref);
    stopPresets?.();
  };
}
