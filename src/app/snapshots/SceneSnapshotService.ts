import type { App, TFile } from 'obsidian';
import { isPersistedMapEnvelope, type PersistedMapEnvelope } from '../services/MapPersistence';
import { createSnapshot, isSceneSnapshot, restoreSnapshot, type SceneSnapshot } from './sceneSnapshotFormat';
import { parentFolderOf, snapshotFilePath, snapshotThumbnailPath } from './snapshotPaths';
import { snapshotStorageFor } from './snapshotStorage';
import { t } from '../i18n';

export interface SceneSnapshotEntry {
  snapshot: SceneSnapshot;
  /** Vault path of the snapshot file. */
  path: string;
  /** Vault path of its thumbnail, when it has one. */
  thumbnailPath: string | null;
}

const DEFAULT_NAME = t('snapshots.defaultName');

/** The first free default name: "Snapshot 3" when "Snapshot 1" and "Snapshot 2" exist. */
export function nextSnapshotName(existingNames: readonly string[]): string {
  const taken = new Set(existingNames);
  let n = existingNames.length + 1;
  while (taken.has(`${DEFAULT_NAME} ${n}`)) n++;
  return `${DEFAULT_NAME} ${n}`;
}

function parseJson(data: string): unknown {
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
}

/**
 * Reads and writes the snapshots of a scene: one JSON file per snapshot plus
 * a JPEG thumbnail, in the scene's snapshot folder (`sceneSnapshotFolder`),
 * ordinary vault files that sync tools carry; a map that belongs to no scene
 * keeps them in the hidden folder beside it (`snapshotStorageFor`). Works on
 * files only; the open map view flushes and reloads around it.
 */
export class SceneSnapshotService {
  constructor(private readonly app: App) {}

  /** The snapshots in `folder`, newest first. Files that cannot be read are skipped. */
  async list(folder: string): Promise<SceneSnapshotEntry[]> {
    const storage = snapshotStorageFor(this.app, folder);
    const paths = new Set(await storage.list(folder));
    const entries: SceneSnapshotEntry[] = [];
    for (const path of paths) {
      if (!path.endsWith('.json')) continue;
      const snapshot = this.parse(await storage.read(path));
      if (!snapshot) continue;
      const thumbnailPath = snapshotThumbnailPath(folder, snapshot.id);
      entries.push({ snapshot, path, thumbnailPath: paths.has(thumbnailPath) ? thumbnailPath : null });
    }
    return entries.sort((a, b) => b.snapshot.createdAt - a.snapshot.createdAt);
  }

  /** An image URL for the entry's thumbnail that changes whenever the snapshot is overwritten. */
  thumbnailUrl(entry: SceneSnapshotEntry): string | null {
    const url = entry.thumbnailPath ? snapshotStorageFor(this.app, entry.thumbnailPath).resourceUrl(entry.thumbnailPath) : null;
    if (!url) return null;
    const version = entry.snapshot.updatedAt ?? entry.snapshot.createdAt;
    return `${url}${url.includes('?') ? '&' : '?'}v=${version}`;
  }

  /** Saves what the map file holds now as a new snapshot in `folder`. Flush pending map saves first. */
  async create(folder: string, mapFile: TFile, name: string, thumbnail: ArrayBuffer | null): Promise<SceneSnapshot> {
    const envelope = await this.readMap(mapFile);
    const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const snapshot = createSnapshot(envelope, id, name, Date.now());
    const storage = snapshotStorageFor(this.app, folder);
    await storage.create(snapshotFilePath(folder, id), JSON.stringify(snapshot));
    if (thumbnail) await storage.writeBinary(snapshotThumbnailPath(folder, id), thumbnail);
    return snapshot;
  }

  /**
   * Replaces the snapshot's state and thumbnail with what the map file holds
   * now. It keeps its id, name and creation time. Flush pending map saves first.
   */
  async overwrite(entry: SceneSnapshotEntry, mapFile: TFile, thumbnail: ArrayBuffer | null): Promise<SceneSnapshot> {
    const { id, name, createdAt } = entry.snapshot;
    const snapshot: SceneSnapshot = { ...createSnapshot(await this.readMap(mapFile), id, name, createdAt), updatedAt: Date.now() };
    const storage = snapshotStorageFor(this.app, entry.path);
    await storage.update(entry.path, () => JSON.stringify(snapshot));
    if (thumbnail) await storage.writeBinary(snapshotThumbnailPath(parentFolderOf(entry.path), id), thumbnail);
    return snapshot;
  }

  async rename(entry: SceneSnapshotEntry, name: string): Promise<void> {
    await snapshotStorageFor(this.app, entry.path).update(entry.path, (data) => {
      const snapshot = parseJson(data);
      return isSceneSnapshot(snapshot) ? JSON.stringify({ ...snapshot, name }) : data;
    });
  }

  /** Moves the snapshot and its thumbnail to the trash, and the scene's folder too once it is empty. */
  async delete(entry: SceneSnapshotEntry): Promise<void> {
    const storage = snapshotStorageFor(this.app, entry.path);
    for (const path of [entry.path, entry.thumbnailPath]) if (path) await storage.remove(path);
    await storage.removeFolderIfEmpty(parentFolderOf(entry.path));
  }

  /** Writes the snapshot's state into the map file. The open view must reload the map afterwards. */
  async restoreInto(mapFile: TFile, snapshot: SceneSnapshot): Promise<void> {
    await this.app.vault.process(mapFile, (data) => {
      const parsed = parseJson(data);
      const current: PersistedMapEnvelope = isPersistedMapEnvelope(parsed) ? parsed : {};
      return JSON.stringify(restoreSnapshot(current, snapshot, mapFile.path));
    });
  }

  /**
   * Runs `rewrite` over each snapshot file in `paths` and saves the files it
   * returns new content for. A file that fails is reported and skipped.
   * Returns whether any file changed.
   */
  async rewriteFiles(paths: Iterable<string>, rewrite: (content: string) => string | null): Promise<boolean> {
    let changed = false;
    for (const path of paths) {
      const storage = snapshotStorageFor(this.app, path);
      const content = await storage.read(path);
      if (content === null) continue;
      try {
        if (rewrite(content) === null) continue;
        await storage.update(path, (latest) => rewrite(latest) ?? latest);
        changed = true;
      } catch (error) {
        console.error(`[Atlas] Could not update the snapshot ${path}:`, error);
      }
    }
    return changed;
  }

  private async readMap(mapFile: TFile): Promise<PersistedMapEnvelope> {
    const envelope = parseJson(await this.app.vault.read(mapFile));
    if (!isPersistedMapEnvelope(envelope) || !envelope.state) {
      throw new Error(`Map file cannot be read: ${mapFile.path}`);
    }
    return envelope;
  }

  private parse(content: string | null): SceneSnapshot | null {
    const parsed = content === null ? null : parseJson(content);
    return isSceneSnapshot(parsed) ? parsed : null;
  }
}
