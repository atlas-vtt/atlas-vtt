import { useCallback, useEffect, useMemo, useState } from 'react';
import { Notice, TFile } from 'obsidian';
import { useAtlasUI } from '../../root/AtlasUIContext';
import { useAtlasStore } from '../../ViewStoreContext';
import { SceneSnapshotService, nextSnapshotName, type SceneSnapshotEntry } from '../../../snapshots/SceneSnapshotService';
import { snapshotFolderForMap } from '../../../snapshots/sceneSnapshotFolders';
import { AssetService } from '../../../services/AssetService';
import { confirmAction } from '../../../ui/confirmDialog';
import { confirmSnapshotRestore, restoreSnapshotInView } from '../../../snapshots/snapshotRestore';
import { copyAtlasLink } from '../../../links/atlasLinkText';
import { SNAPSHOT_THUMBNAIL_SIZE } from '../../../services/MapThumbnailService';
import { t } from '../../../i18n';

export interface SceneSnapshotsController {
  entries: SceneSnapshotEntry[];
  isLoading: boolean;
  /** True while a snapshot is being written or restored. */
  isBusy: boolean;
  /** Image URL of the entry's thumbnail, or null when it has none. */
  thumbnailUrl: (entry: SceneSnapshotEntry) => string | null;
  save: () => Promise<void>;
  restore: (entry: SceneSnapshotEntry) => Promise<void>;
  overwrite: (entry: SceneSnapshotEntry) => Promise<void>;
  rename: (entry: SceneSnapshotEntry, name: string) => Promise<void>;
  remove: (entry: SceneSnapshotEntry) => Promise<void>;
  /** Copies a link to the snapshot, which opens the scene and offers to restore it. */
  copyLink: (entry: SceneSnapshotEntry) => Promise<void>;
}

/**
 * The snapshots of the scene open in this view and the actions on them.
 * Restoring, overwriting and deleting ask for confirmation first. `onRestore` runs right
 * before a snapshot replaces the map, so the caller can get out of the way.
 */
export function useSceneSnapshots(onRestore: () => void): SceneSnapshotsController {
  const { app, view } = useAtlasUI();
  const mapPath = useAtlasStore((state) => state.mapPath);
  const service = useMemo(() => new SceneSnapshotService(app), [app]);
  const [entries, setEntries] = useState<SceneSnapshotEntry[]>([]);
  const [folder, setFolder] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isBusy, setIsBusy] = useState(false);

  const refresh = useCallback(async (): Promise<void> => {
    const sceneFolder = mapPath ? await snapshotFolderForMap(AssetService.getInstance(app), mapPath) : null;
    setFolder(sceneFolder);
    setEntries(sceneFolder ? await service.list(sceneFolder) : []);
    setIsLoading(false);
  }, [app, mapPath, service]);

  useEffect(() => {
    setIsLoading(true);
    void refresh();
  }, [refresh]);

  /** Runs one snapshot operation at a time and reports a failure to the user. */
  const run = useCallback(async (task: () => Promise<void>, failure: string): Promise<void> => {
    setIsBusy(true);
    try {
      await task();
    } catch (error: unknown) {
      console.error(`[Atlas] ${failure}:`, error);
      new Notice(failure);
    } finally {
      setIsBusy(false);
      await refresh();
    }
  }, [refresh]);

  const save = useCallback(async (): Promise<void> => {
    const mapFile = view?.file;
    if (!view || !folder || !(mapFile instanceof TFile)) return;
    const name = nextSnapshotName(entries.map((entry) => entry.snapshot.name));

    await run(async () => {
      await view.saveMap();
      await service.create(folder, mapFile, name, await view.serviceManager.renderMapThumbnailWhenDrawn(SNAPSHOT_THUMBNAIL_SIZE));
    }, t('snapshots.saveFailed'));
  }, [entries, folder, run, service, view]);

  const restore = useCallback(async (entry: SceneSnapshotEntry): Promise<void> => {
    if (!view || !(await confirmSnapshotRestore(entry))) return;

    onRestore();
    await run(() => restoreSnapshotInView(view, service, entry), t('snapshots.restoreFailed'));
  }, [onRestore, run, service, view]);

  /** An empty name keeps the old one: every snapshot has a name. */
  const overwrite = useCallback(async (entry: SceneSnapshotEntry): Promise<void> => {
    const mapFile = view?.file;
    if (!view || !(mapFile instanceof TFile)) return;
    const confirmed = await confirmAction({
      title: t('snapshots.overwriteTitle', { name: entry.snapshot.name }),
      message: [
        t('snapshots.overwriteBody'),
      ],
      confirmLabel: t('common.overwrite'),
      destructive: true,
    });
    if (!confirmed) return;

    await run(async () => {
      await view.saveMap();
      await service.overwrite(entry, mapFile, await view.serviceManager.renderMapThumbnailWhenDrawn(SNAPSHOT_THUMBNAIL_SIZE));
    }, t('snapshots.overwriteFailed'));
  }, [run, service, view]);

  const rename = useCallback(async (entry: SceneSnapshotEntry, requestedName: string): Promise<void> => {
    const name = requestedName.trim();
    if (!name || name === entry.snapshot.name) return;
    // Show the new name at once, like a file rename; the refresh after writing confirms it.
    setEntries((current) => current.map((item) => (item === entry ? { ...item, snapshot: { ...item.snapshot, name } } : item)));
    await run(() => service.rename(entry, name), t('snapshots.renameFailed'));
  }, [run, service]);

  const remove = useCallback(async (entry: SceneSnapshotEntry): Promise<void> => {
    const confirmed = await confirmAction({
      title: t('snapshots.deleteTitle', { name: entry.snapshot.name }),
      message: [t('snapshots.deleteBody')],
      confirmLabel: t('common.delete'),
      destructive: true,
    });
    if (!confirmed) return;
    await run(() => service.delete(entry), t('snapshots.deleteFailed'));
  }, [run, service]);

  const copyLink = useCallback(async (entry: SceneSnapshotEntry): Promise<void> => {
    if (mapPath) await copyAtlasLink(app, mapPath, { snapshot: entry.snapshot.name });
  }, [app, mapPath]);

  const thumbnailUrl = useCallback((entry: SceneSnapshotEntry): string | null => service.thumbnailUrl(entry), [service]);

  return { entries, isLoading, isBusy, thumbnailUrl, save, restore, overwrite, rename, remove, copyLink };
}
