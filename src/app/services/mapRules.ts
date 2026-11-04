import type { App } from 'obsidian';
import { CampaignFiles } from '../campaigns/CampaignFiles';
import { CampaignService } from '../campaigns/CampaignService';
import type { CampaignSystem } from '../campaigns/campaignSystem';
import { PlayedRules } from '../campaigns/playedRules';
import { rulesForMap, type CollectionLookup, type MapRules, type RulesLookup, type RulesSource } from '../gameSystems/mapRules';
import { AssetService } from './AssetService';
import { SystemPresetFiles } from './systemPresets/SystemPresetFiles';

const lookups = new WeakMap<App, RulesLookup>();

function lookupOver(app: App, collections: () => CollectionLookup): RulesLookup {
  return {
    getCollectionForMap: (mapPath) => collections().getCollectionForMap(mapPath),
    getCollectionSettings: (collectionId) => collections().getCollectionSettings(collectionId),
    playedSystem: () => PlayedRules.forApp(app)?.played() ?? null,
  };
}

/**
 * Where the app looks up a map's rules: the campaign it plays, and `collections` (the asset
 * index unless given), read at every call.
 */
export function rulesLookup(app: App, collections?: CollectionLookup): RulesLookup {
  if (collections) return lookupOver(app, () => collections);
  let lookup = lookups.get(app);
  if (!lookup) {
    lookup = lookupOver(app, () => AssetService.getInstance(app));
    lookups.set(app, lookup);
  }
  return lookup;
}

/** The rules the map at `mapPath` plays by (`rulesForMap`). */
export function mapRules(app: App, mapPath: string | null | undefined): MapRules {
  return rulesForMap(rulesLookup(app), mapPath);
}

/**
 * Calls `listener` whenever the rules of the map at `mapPath()` may have changed: its collection's
 * settings were saved (only while no campaign's system applies), another campaign system applies,
 * a user preset changed (here or on another device), or the asset index, which says which
 * collection a map is in, has loaded. `'any'` follows a save of any collection's settings.
 * Returns the function that stops it.
 */
export function onMapRulesChange(
  app: App,
  mapPath: (() => string | null | undefined) | 'any',
  listener: () => void,
  lookup: RulesLookup = rulesLookup(app),
): () => void {
  let live = true;
  const changed = (): void => { if (live) listener(); };
  const settingsRef = app.workspace.on('atlas-vtt:collection-settings-changed', (collectionId) => {
    if (lookup.playedSystem()) return;
    if (mapPath === 'any') return changed();
    const path = mapPath();
    if (path && lookup.getCollectionForMap(path) === collectionId) changed();
  });
  const stops = [PlayedRules.forApp(app)?.onChange(changed), SystemPresetFiles.forApp(app)?.onChange(changed)];
  // A reader built before the index was loaded read its map as outside every collection.
  AssetService.getInstance(app).initialize().then(changed, () => undefined);
  return () => {
    live = false;
    app.workspace.offref(settingsRef);
    for (const stop of stops) stop?.();
  };
}

/**
 * Changes the rules where they come from (`MapRules.source`): the collection's settings, or the
 * campaign's system. A map without rules has nothing to change.
 */
export async function updateMapRules(app: App, source: RulesSource, changes: Partial<CampaignSystem>): Promise<void> {
  if (source.kind === 'collection') {
    await AssetService.getInstance(app).updateCollectionSettings(source.id, changes);
    return;
  }
  const campaigns = CampaignFiles.forApp(app);
  if (source.kind === 'campaign' && campaigns) new CampaignService(campaigns).update(source.id, { system: changes });
}
