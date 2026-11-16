import { TFolder, type App } from 'obsidian';
import type { SceneAsset } from '../services/AssetService';
import { COPY_SETTLE_MS, libraryClock } from '../services/library/libraryState';
import { sceneBackground } from '../services/sceneBackground';
import { isRecoveredId } from '../services/vault-sync/recoveredIds';
import { SceneSnapshotService } from './SceneSnapshotService';
import { snapshotFolderOf } from './sceneSnapshotFolders';
import { collectionSnapshotsFolder } from './snapshotPaths';

type OrphanScene = Pick<SceneAsset, 'id' | 'collection' | 'createdAt' | 'data'>;

/** The map backgrounds the snapshots in `folder` show. */
async function backgroundsIn(service: SceneSnapshotService, folder: TFolder): Promise<Set<string | null | undefined>> {
  return new Set((await service.list(folder.path)).map((entry) => entry.snapshot.state.background));
}

/**
 * Gives scenes back the snapshots an id change left behind: a scene whose
 * record was rebuilt from its map under a new id (`adoptSceneMap`) no longer
 * finds the folder its snapshots were saved in. A scene without a snapshot
 * folder takes the one folder of its collection that is named for no scene
 * and whose snapshots show its map's background, when no other such scene or
 * folder matches; anything less certain stays where it is. The choice reads
 * only files and the index, so every device makes the same, and nothing is
 * ever trashed.
 *
 * A folder named for a rebuilt scene (`recoveredId`) goes to the real scene
 * once its record is back. A rebuilt scene takes a folder only once it has
 * stood `COPY_SETTLE_MS`, since a sync tool may deliver a map before the
 * record that keeps its id, and the folder would then move away from the
 * scene that owns it.
 */
export async function adoptOrphanedSnapshots(app: App, scenes: readonly OrphanScene[]): Promise<void> {
  const sceneIds = new Set(scenes.map((scene) => scene.id));
  const now = libraryClock.now();
  const settled = (scene: OrphanScene): boolean => isRecoveredId(scene.id) && now - scene.createdAt >= COPY_SETTLE_MS;
  const service = new SceneSnapshotService(app);
  const waiting = scenes.filter((scene) => !app.vault.getFolderByPath(snapshotFolderOf(scene)));
  for (const collectionId of new Set(waiting.map((scene) => scene.collection))) {
    const orphans = (app.vault.getFolderByPath(collectionSnapshotsFolder(collectionId))?.children ?? [])
      .filter((child): child is TFolder => child instanceof TFolder && !sceneIds.has(child.name));
    const inCollection = waiting.filter((scene) => scene.collection === collectionId);
    // Nothing is read where no folder could move.
    if (!orphans.some((orphan) => isRecoveredId(orphan.name)) && !inCollection.some(settled)) continue;

    const read = await Promise.all(orphans.map(async (folder) => ({ folder, backgrounds: await backgroundsIn(service, folder) })));
    const candidates = (await Promise.all(inCollection.map(async (scene) => ({ scene, background: scene.data?.mapPath ? await sceneBackground(app, scene.data.mapPath) : undefined }))))
      .filter((candidate): candidate is { scene: OrphanScene; background: string } => Boolean(candidate.background));
    for (const { folder, backgrounds } of read) {
      const matches = candidates.filter(({ background }) => backgrounds.has(background));
      if (matches.length !== 1) continue;
      const { scene, background } = matches[0]!;
      const rivals = read.filter((other) => other.folder !== folder && other.backgrounds.has(background));
      if (rivals.length > 0 || !(isRecoveredId(folder.name) || settled(scene))) continue;
      await app.fileManager.renameFile(folder, snapshotFolderOf(scene));
    }
  }
}
