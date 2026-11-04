import { TFile, type App } from 'obsidian';
import { debounce, type DebouncedFunction } from '../../utils/debounce';
import { ensureFolder } from '../plugin/vaultFolders';
import { getDataFilePath } from '../utils/dataFileMigration';
import { sceneNameOf } from '../utils/sceneName';
import { settledWithin } from '../utils/settledWithin';
import { showNotice } from '../ui/notice';

/** How long a flush waits for a file write before it reports the save as stuck. */
export const STALLED_SAVE_MS = 5000;
/** Edits are gathered this long before they are written. */
const SAVE_DELAY_MS = 500;
/** Scenes whose debounced saver is kept; older ones are flushed and dropped. */
const KEPT_SAVERS = 5;

/**
 * Writes scene snapshots to their files: debounced per scene, one write after the other,
 * and never an older state over a newer one.
 *
 * Snapshots are objects, not strings: serialization only happens inside the debounced
 * save, so frequent store writes (drags, selection) never pay for a full-map JSON.stringify.
 */
export class SceneFileWriter<V> {
  private readonly pendingWrites = new Map<string, Promise<void>>();
  private readonly savers = new Map<string, DebouncedFunction<[path: string, snapshot: V]>>();
  /**
   * Counts, per scene, the queued writes and the loads of its file. A write changes the
   * file only while it is the latest of them: one the flush gave up on may reach the file
   * much later, after a newer save or after the scene was loaded again.
   */
  private readonly generations = new Map<string, number>();
  /**
   * Scene files this writer has seen on disk. One of them that is gone was deleted: a rename
   * moves the store to the new path, so only a deletion leaves it bound to the old one, and
   * a save must not bring the file back.
   */
  private readonly seenOnDisk = new Set<string>();

  /**
   * @param isBoundTo Whether the store is still bound to the scene at `path`; only then may its file be created.
   * @param serialize The content of the file for a snapshot.
   */
  constructor(
    private readonly app: App,
    private readonly isBoundTo: (path: string) => boolean,
    private readonly serialize: (snapshot: V) => string = JSON.stringify,
  ) {}

  /** Schedules `snapshot` as the next content of the scene at `path`. */
  schedule(path: string, snapshot: V): void {
    let saver = this.savers.get(path);
    if (!saver) {
      saver = debounce((scenePath: string, latest: V) => this.queue(scenePath, latest), SAVE_DELAY_MS);
      this.savers.set(path, saver);
    }
    saver(path, snapshot);
    this.dropOldSavers(path);
  }

  /** The scene's file is being read: whatever is still on its way to it is older than what is read now. */
  supersedeWrites(path: string): void {
    this.nextGeneration(path);
  }

  /** The scene's file is there (it is being read): should it go, no save creates it again. */
  fileSeen(path: string): void {
    this.seenOnDisk.add(path);
  }

  /** Writes every scheduled snapshot now and waits for the writes, but not forever. */
  async flush(): Promise<void> {
    // ALL scenes, not just the current one: a scene switch must see the old scene's saves complete
    for (const saver of this.savers.values()) saver.flush();
    // A timer may already have started a save before flush was called.
    while (this.pendingWrites.size > 0) {
      if (await settledWithin(Promise.all(this.pendingWrites.values()), STALLED_SAVE_MS)) continue;
      // Whoever waits for the flush (a scene switch, closing the view) must not wait forever.
      // The stuck writes are let go, so later saves of these scenes are not queued behind them.
      for (const path of this.pendingWrites.keys()) {
        console.error(`[AtlasStorage] Saving ${path} did not finish`);
        showNotice(`Atlas VTT could not finish saving ${sceneNameOf(path)}. Its latest changes may be missing from its file.`, 0);
      }
      this.pendingWrites.clear();
    }
  }

  private nextGeneration(path: string): number {
    const generation = (this.generations.get(path) ?? 0) + 1;
    this.generations.set(path, generation);
    return generation;
  }

  private queue(path: string, snapshot: V): void {
    // Preserve snapshot order even when a previous disk write is still running.
    const previous = this.pendingWrites.get(path) ?? Promise.resolve();
    const generation = this.nextGeneration(path);
    const write = previous.then(() => this.write(path, snapshot, generation));
    this.pendingWrites.set(path, write);
    void write.then(() => {
      if (this.pendingWrites.get(path) === write) this.pendingWrites.delete(path);
    });
  }

  private async write(path: string, snapshot: V, generation: number): Promise<void> {
    const isLatest = (): boolean => this.generations.get(path) === generation;
    try {
      const data = this.serialize(snapshot);
      const dataPath = getDataFilePath(path);
      await ensureFolder(this.app, dataPath.substring(0, dataPath.lastIndexOf('/')));

      const existingFile = this.app.vault.getAbstractFileByPath(dataPath);
      if (existingFile instanceof TFile) {
        this.seenOnDisk.add(path);
        await this.app.vault.process(existingFile, (current) => (isLatest() ? data : current));
      } else if (!this.seenOnDisk.has(path) && this.isBoundTo(path) && isLatest()) {
        await this.app.vault.create(dataPath, data);
        this.seenOnDisk.add(path);
      }
      // Otherwise the map was deleted, or renamed while this save waited; the
      // store has already scheduled its state for the new path, so recreating
      // the old file would bring back a deleted scene or leave a stale copy.
    } catch (error) {
      console.error(`[AtlasStorage] Error writing map file ${path}:`, error);
    }
  }

  /** Keeps the savers of the most recent scenes, so they do not pile up over a session. */
  private dropOldSavers(current: string): void {
    if (this.savers.size <= KEPT_SAVERS) return;
    const paths = Array.from(this.savers.keys());
    const kept = new Set([current]);
    for (let index = paths.length - 1; index >= 0 && kept.size < KEPT_SAVERS; index--) kept.add(paths[index]!);
    for (const path of paths) {
      if (kept.has(path)) continue;
      this.savers.get(path)?.flush();
      this.savers.delete(path);
    }
  }
}
