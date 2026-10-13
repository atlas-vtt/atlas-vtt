import type { App } from 'obsidian';
import type { AssetMetadata } from '../AssetService';
import { desiredLibraryFiles } from './libraryFiles';
import { readLibraryChanges } from './libraryReader';
import { mergeLibraryChanges, type LibraryMergeResult } from './mergeLibraryChanges';
import { LibraryWriter } from './libraryWriter';
import { LIBRARY_FILE_FORMAT } from './collectionFile';
import { assetKey, collectionIdentity, COPY_SETTLE_MS, emptyLibraryState, libraryClock, type LibraryState } from './libraryState';
import { hashText } from '../../utils/hashing';
import { collectionFilePath, LEGACY_INDEX_FILE, recordFilePath } from './libraryPaths';
import { trashVaultItem } from '../../utils/trashVaultItem';
import { RECORD_FORMAT, serializeRecord } from './recordFile';
import { isRecoveredId } from '../vault-sync/recoveredIds';

/** Local-storage key recording that this device keeps its library in vault files. Per device on purpose: every device migrates its own index. */
const MIGRATED_KEY = 'atlas-vtt:library-files';


/**
 * Keeps the library's vault files and the index, this device's cache of them,
 * in step: reads the files that changed, writes the records that changed, and
 * keeps the device-local bookkeeping (stamps of known files, derived records).
 */
export class LibrarySync {
  private state: LibraryState = emptyLibraryState();
  private readonly writer: LibraryWriter;
  /** Whether the files have been read once; until then nothing is written, so no file is written from an index older than the vault. */
  private filesRead = false;
  private filesWritten = false;
  /** When this device first saw each file that looks like a copy and is not taken in yet. */
  private readonly copySince = new Map<string, number>();

  constructor(private readonly app: App) {
    this.writer = new LibraryWriter(app, () => this.state);
  }

  /** The bookkeeping stored with the index, which keeps the two consistent wherever the index comes from. */
  get bookkeeping(): LibraryState {
    return this.state;
  }

  /** Takes the bookkeeping stored with a loaded index. */
  restore(state: LibraryState): void {
    this.state = state;
  }

  /** Whether this device has written its library to vault files. */
  get migrated(): boolean {
    return this.app.loadLocalStorage(MIGRATED_KEY) === true;
  }

  /** Whether the files were read but not yet written this session: the first write brings them in line with the index (on the first start, it migrates). */
  get awaitsFirstWrite(): boolean {
    return this.filesRead && !this.filesWritten;
  }

  /** Reads the library files that changed and takes them into `metadata`. */
  async read(metadata: AssetMetadata): Promise<LibraryMergeResult> {
    const changes = await readLibraryChanges(this.app, this.state, RECORD_FORMAT, LIBRARY_FILE_FORMAT);
    const now = libraryClock.now();
    let retryAt: number | null = null;
    const settledCopy = (path: string): boolean => {
      const since = this.copySince.get(path) ?? now;
      this.copySince.set(path, since);
      if (now - since >= COPY_SETTLE_MS) return true;
      retryAt = Math.min(retryAt ?? Infinity, since + COPY_SETTLE_MS);
      return false;
    };
    const result = mergeLibraryChanges(metadata, this.state, changes, this.migrated, {
      hasCollectionFile: (id) => this.app.vault.getFileByPath(collectionFilePath(id)) !== null,
      settledCopy,
    });
    result.retryAt = retryAt;
    for (const path of this.copySince.keys()) if (this.state.files[path] || !this.app.vault.getFileByPath(path)) this.copySince.delete(path);
    this.filesRead = true;
    if (result.duplicates.length > 0) {
      console.warn('[Atlas library] These files hold a record another file already holds (copies a sync tool made on a conflict) and were left alone:', result.duplicates);
    }
    return result;
  }

  /** The assets of an index, to tell after an automatic step which records it adopted. */
  assetIds(metadata: AssetMetadata): Set<string> {
    return new Set(Object.keys(metadata.assets));
  }

  /**
   * After a step Atlas took by itself (loading, a vault check): records it
   * adopted from files no record owned (recovered ids, the same on every
   * device) stay unwritten until the user changes them, as do records an
   * earlier version adopted and nobody changed. Only what adoption made counts,
   * so nothing the user made meanwhile is held back. Collections and the library
   * are recognised by their content (`DesiredFile.derivable`).
   */
  markDerived(metadata: AssetMetadata, before: ReadonlySet<string>): void {
    const migrated = this.migrated;
    const fromFiles = new Set(Object.values(this.state.files).map((stamp) => stamp.key));
    const present = new Set(Object.values(metadata.collections).map((collection) => collectionIdentity(collection.uid)));
    for (const asset of Object.values(metadata.assets)) {
      const identity = assetKey(asset.id);
      present.add(identity);
      if (this.state.derived[identity] !== undefined || !isRecoveredId(asset.id) || fromFiles.has(identity)) continue;
      if (this.app.vault.getFileByPath(recordFilePath(asset))) continue;
      const adoptedNow = !before.has(asset.id);
      const untouchedFromBefore = !migrated && asset.modifiedAt === asset.createdAt;
      if (adoptedNow || untouchedFromBefore) this.state.derived[identity] = hashText(serializeRecord(asset));
    }
    for (const identity of Object.keys(this.state.derived)) if (!present.has(identity)) delete this.state.derived[identity];
  }

  /** Writes what changed to the library files, once they have been read; the first full write migrates this device. */
  async persist(snapshot: AssetMetadata): Promise<void> {
    if (!this.filesRead) return;
    await this.writer.write(desiredLibraryFiles(snapshot));
    this.filesWritten = true;
    if (this.migrated) return;
    this.app.saveLocalStorage(MIGRATED_KEY, true);
    await this.retireLegacyIndex();
  }

  /** The visible index of older versions is frozen once the library is in its files; left in place, it would bring deleted records back on a new device. */
  private async retireLegacyIndex(): Promise<void> {
    const legacy = this.app.vault.getFileByPath(LEGACY_INDEX_FILE);
    if (!legacy) return;
    try {
      await trashVaultItem(this.app, legacy);
    } catch (error) {
      console.error('[Atlas library] Could not remove the old visible index:', error);
    }
  }

  /** Whether the record of `id` has a file this device read or wrote, so its art or map missing for now does not remove it. */
  hasRecordFile(id: string, path: string): boolean {
    return this.state.files[path]?.key === assetKey(id);
  }
}
