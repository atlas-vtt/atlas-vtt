import { type App, type TFile } from 'obsidian';
import type { AtlasView } from '../atlas-view';
import { loadAtlasView, openMapInView } from '../plugin/atlasLeaves';
import { AssetService } from '../services/AssetService';
import { confirmSnapshotRestore, restoreSnapshotInView } from '../snapshots/snapshotRestore';
import { spawnEncounterTokens, type SpawnPlacement } from '../packages/components/asset-manager/utils/tokenSpawnService';
import { formatServiceAsset } from '../packages/components/asset-manager/utils/assetFormatters';
import { encounterOfFile, findSnapshot, snapshotsOfMap } from './atlasLinkAssets';
import { snapshotNameOfSubpath } from './atlasLinkTargets';
import { t } from '../i18n';
import { showNotice } from '../ui/notice';
import { diceRandom } from '../services/offlineDiceInputs';

/** How long a snapshot link waits for its scene to open before it gives up. */
const SCENE_OPEN_TIMEOUT_MS = 30_000;

/**
 * The Atlas view once it shows the scene at `mapPath` loaded, or null when it
 * does not within `SCENE_OPEN_TIMEOUT_MS` (another scene was opened, the load failed).
 */
async function whenSceneShown(app: App, mapPath: string): Promise<AtlasView | null> {
  const view = await loadAtlasView(app);
  if (!view) return null;
  const store = view.getStore();
  const shows = (state: ReturnType<typeof store.getState>): boolean =>
    state.mapLoaded && !state.isMapLoading && state.mapPath === mapPath;
  if (shows(store.getState())) return view;

  return new Promise((resolve) => {
    const finish = (result: AtlasView | null): void => {
      window.clearTimeout(timer);
      unsubscribe();
      resolve(result);
    };
    const timer = window.setTimeout(() => finish(null), SCENE_OPEN_TIMEOUT_MS);
    const unsubscribe = store.subscribe((state) => {
      if (shows(state)) finish(view);
    });
  });
}

/**
 * Offers to restore the snapshot a link names once the scene at `mapPath` is
 * open, with the confirmation the snapshots panel shows. Throws when the restore fails.
 */
export async function restoreLinkedSnapshot(app: App, mapPath: string, subpath: string): Promise<void> {
  const name = snapshotNameOfSubpath(subpath);
  if (!name) return;
  const { service, entries } = await snapshotsOfMap(app, mapPath);
  const entry = findSnapshot(entries, name);
  if (!entry) {
    showNotice(t('atlasLinks.snapshotMissing', { name }));
    return;
  }
  if (!(await whenSceneShown(app, mapPath)) || !(await confirmSnapshotRestore(entry))) return;
  // The scene may have been loaded again while the dialog was open
  const view = await whenSceneShown(app, mapPath);
  if (view) await restoreSnapshotInView(view, service, entry);
}

/** Opens a scene in Atlas and, when the link names one of its snapshots, offers to restore it. */
export async function openSceneLink(app: App, file: TFile, subpath: string): Promise<void> {
  await openMapInView(app, file);
  await restoreLinkedSnapshot(app, file.path, subpath);
}

/** Brings the encounter whose JSON is `file` into the open scene as its asset manager card does (`placement`: on the map, a fight, beside it). */
export async function placeEncounterFile(app: App, file: TFile, placement: SpawnPlacement = 'map'): Promise<void> {
  const assets = AssetService.getInstance(app);
  const encounter = await encounterOfFile(assets, file.path);
  if (!encounter) {
    showNotice(t('atlasLinks.encounterMissing'));
    return;
  }
  const shown = formatServiceAsset(encounter, '', app);
  if (shown.type === 'encounters') await spawnEncounterTokens({ app, view: null, assetService: assets, random: diceRandom }, shown, placement);
}
