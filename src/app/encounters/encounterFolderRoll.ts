import type { App } from 'obsidian';
import type { AtlasView } from '../atlas-view';
import { AssetService } from '../services/AssetService';
import { collectionIdOfPath } from '../services/assetPaths';
import { primaryPath } from '../services/vault-sync/assetFiles';
import { diceRandom } from '../services/offlineDiceInputs';
import { formatServiceAsset, tokenPreviewSources } from '../packages/components/asset-manager/utils/assetFormatters';
import { spawnEncounterTokens } from '../packages/components/asset-manager/utils/tokenSpawnService';
import type { EncounterAsset } from '../packages/components/asset-manager/types';
import { encounterFolderName } from './encounterFolders';
import { showNotice } from '../ui/notice';
import { getLocale, t } from '../i18n';

/** The encounters in `folder` and every folder below it, by name, as the asset manager shows them. */
export async function encountersInFolder(app: App, folder: string): Promise<EncounterAsset[]> {
  const assets = AssetService.getInstance(app);
  const stored = (await assets.getAssets(collectionIdOfPath(folder) ?? undefined, 'encounter'))
    .filter((encounter) => primaryPath(encounter)?.startsWith(`${folder}/`) === true);
  if (stored.length === 0) return [];
  const previews = tokenPreviewSources(await assets.getTokenAssets());
  return stored
    .map((encounter) => formatServiceAsset(encounter, '', app, previews))
    .filter((shown): shown is EncounterAsset => shown.type === 'encounters')
    .sort((a, b) => a.name.localeCompare(b.name, getLocale()));
}

/**
 * Puts the encounter's tokens in the GM's hand on `view`'s map, as a double-click on it in the
 * asset manager does: its dice counts are rolled, and each token is added as it is put down.
 */
export async function placeEncounter(app: App, view: AtlasView | null, encounter: EncounterAsset): Promise<void> {
  await spawnEncounterTokens({ app, view, assetService: AssetService.getInstance(app), random: diceRandom }, encounter);
}

/** One of `encounters`, every one as likely; repeats are allowed. Null for none. */
export function pickEncounter<T>(encounters: readonly T[], random: () => number): T | null {
  if (encounters.length === 0) return null;
  return encounters[Math.min(encounters.length - 1, Math.floor(random() * encounters.length))] ?? null;
}

/** Rolls one of the encounters in `folder` and puts it in the GM's hand, saying which came up; tells the GM where the folder holds none. */
export async function rollEncounterFolder(app: App, view: AtlasView | null, folder: string, random: () => number = diceRandom): Promise<void> {
  const encounters = await encountersInFolder(app, folder);
  const picked = pickEncounter(encounters, random);
  if (!picked) {
    showNotice(t('pin.encounters.empty', { name: encounterFolderName(folder) }));
    return;
  }
  showNotice(t('pin.encounters.rolled', { name: picked.name, count: encounters.length }));
  await placeEncounter(app, view, picked);
}
