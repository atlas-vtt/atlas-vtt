import { TFile, type App } from 'obsidian';
import { ensureFolder } from '../../plugin/vaultFolders';
import { trashVaultItem } from '../../utils/trashVaultItem';
import { parentPath } from '../../utils/pathUtils';
import type { DesiredFile } from './libraryFiles';
import { assetKey, idOfKey, type FileStamp, type LibraryState } from './libraryState';
import { hashText } from '../../utils/hashing';

const stampOf = (file: TFile, key: string, hash: string): FileStamp => ({ key, hash, mtime: file.stat.mtime, size: file.stat.size });

/**
 * Brings the library files in line with the index, writing only what changed
 * since this device last read or wrote each file:
 * - a record Atlas worked out by itself and the user never changed stays unwritten;
 * - a file that vanished since it was last seen is left to the vault check, which
 *   decides whether it was deleted or moved elsewhere; it is never written back;
 * - a record whose file moved (its collection changed) is renamed, so sync tools see a move;
 * - files of records that left the index are trashed.
 * A file that fails is tried again on the next save; the others are still
 * written, and the failure is reported once all were tried.
 */
export class LibraryWriter {
  constructor(private readonly app: App, private readonly stateOf: () => LibraryState) {}

  private get state(): LibraryState {
    return this.stateOf();
  }

  async write(desired: readonly DesiredFile[]): Promise<void> {
    const pathsByKey = new Map<string, string>();
    for (const [path, stamp] of Object.entries(this.state.files)) pathsByKey.set(stamp.key, path);
    const desiredKeys = new Set(desired.map((file) => file.key));
    const desiredPaths = new Set(desired.map((file) => file.path));

    const failures: string[] = [];
    for (const file of desired) {
      try {
        await this.writeOne(file, pathsByKey.get(file.key));
      } catch (error) {
        console.error(`[Atlas library] Could not write ${file.path}:`, error);
        failures.push(file.path);
      }
    }
    for (const [path, stamp] of Object.entries(this.state.files)) {
      if (desiredPaths.has(path) || stamp.readOnly) continue;
      const copied = idOfKey(stamp.key, 'copy');
      // A copied file a record of its own replaced (a token's, whose record file is named for its id) goes once that record is written.
      if (copied !== null && desiredKeys.has(assetKey(copied)) && this.writtenElsewhere(assetKey(copied), path)) {
        if (await this.isUnchanged(path, stamp)) await this.remove(path);
        continue;
      }
      const removable = idOfKey(stamp.key, 'asset') !== null || idOfKey(stamp.key, 'collection') !== null;
      if (!removable) continue;
      if (desiredKeys.has(stamp.key)) {
        // A record that now lives elsewhere leaves its old file once it was written there, and only while that file is still the copy Atlas wrote.
        if (!this.writtenElsewhere(stamp.key, path)) continue;
        if (!(await this.isUnchanged(path, stamp))) {
          delete this.state.files[path];
          continue;
        }
      }
      if (!(await this.remove(path))) failures.push(path);
    }
    if (failures.length > 0) throw new Error(`Atlas could not save ${failures.length} library file${failures.length === 1 ? '' : 's'} (${failures[0]})`);
  }

  private writtenElsewhere(key: string, path: string): boolean {
    return Object.entries(this.state.files).some(([other, entry]) => other !== path && entry.key === key);
  }

  private async isUnchanged(path: string, stamp: FileStamp): Promise<boolean> {
    const file = this.app.vault.getFileByPath(path);
    return file !== null && hashText(await this.app.vault.read(file)) === stamp.hash;
  }

  private async writeOne(desired: DesiredFile, previousPath: string | undefined): Promise<void> {
    const hash = hashText(desired.content);
    if (this.state.derived[desired.identity] === hash) return;
    delete this.state.derived[desired.identity];

    const stamp = this.state.files[desired.path];
    // Worked out by itself, it is never written where there is no file, nor over a file this device has not taken in (a copy waiting to be one).
    if (desired.derivable && !stamp) return;
    if (stamp?.readOnly || stamp?.hash === hash) return;
    let file = this.app.vault.getFileByPath(desired.path);
    if (stamp && !file) return;
    if (!file && previousPath && previousPath !== desired.path) file = await this.moveFrom(previousPath, desired.path);
    if (desired.payloadUnread && file) return;

    if (file) {
      if (hashText(await this.app.vault.read(file)) !== hash) await this.app.vault.process(file, () => desired.content);
    } else {
      await ensureFolder(this.app, parentPath(desired.path));
      file = await this.app.vault.create(desired.path, desired.content);
    }
    this.state.files[desired.path] = stampOf(file, desired.key, hash);
  }

  /** Moves a record's file from where it was to where it now belongs; null when it is no longer there. */
  private async moveFrom(from: string, to: string): Promise<TFile | null> {
    const previous = this.app.vault.getFileByPath(from);
    if (!previous || this.state.files[from]?.readOnly) return null;
    await ensureFolder(this.app, parentPath(to));
    await this.app.fileManager.renameFile(previous, to);
    delete this.state.files[from];
    const moved = this.app.vault.getAbstractFileByPath(to);
    return moved instanceof TFile ? moved : null;
  }

  /** Trashes a file of a record that left the index; returns whether it is gone. */
  private async remove(path: string): Promise<boolean> {
    const file = this.app.vault.getFileByPath(path);
    try {
      if (file) await trashVaultItem(this.app, file);
      delete this.state.files[path];
      return true;
    } catch (error) {
      console.error(`[Atlas library] Could not remove ${path}:`, error);
      return false;
    }
  }
}
