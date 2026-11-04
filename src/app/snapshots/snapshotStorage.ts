import { TFile, type App } from 'obsidian';
import { ensureAdapterFolder, ensureFolder } from '../plugin/vaultFolders';
import { isHiddenVaultPath, removeEmptyHiddenFolders, trashHiddenPath } from '../utils/hiddenVaultFiles';
import { parentPath } from '../utils/pathUtils';
import { trashVaultItem } from '../utils/trashVaultItem';

/**
 * Where the files of one snapshot folder are read and written. A scene of a
 * collection keeps its snapshots in the vault (`snapshots/<scene id>/`), where
 * sync tools carry them; a map that belongs to no scene keeps them, as every
 * map did before, in the hidden folder beside it, which only the adapter reaches.
 */
export interface SnapshotStorage {
  /** The paths of the files directly in `folder`. */
  list(folder: string): Promise<string[]>;
  read(path: string): Promise<string | null>;
  create(path: string, content: string): Promise<void>;
  /** Rewrites a file from what it holds when it is written. */
  update(path: string, change: (content: string) => string): Promise<void>;
  writeBinary(path: string, data: ArrayBuffer): Promise<void>;
  remove(path: string): Promise<void>;
  removeFolderIfEmpty(folder: string): Promise<void>;
  resourceUrl(path: string): string | null;
}

class VaultSnapshotStorage implements SnapshotStorage {
  constructor(private readonly app: App) {}

  async list(folder: string): Promise<string[]> {
    return (this.app.vault.getFolderByPath(folder)?.children ?? []).filter((child) => child instanceof TFile).map((file) => file.path);
  }

  async read(path: string): Promise<string | null> {
    const file = this.app.vault.getFileByPath(path);
    return file ? this.app.vault.read(file) : null;
  }

  async create(path: string, content: string): Promise<void> {
    await ensureFolder(this.app, parentPath(path));
    await this.app.vault.create(path, content);
  }

  async update(path: string, change: (content: string) => string): Promise<void> {
    const file = this.app.vault.getFileByPath(path);
    if (!file) throw new Error(`Snapshot file not found: ${path}`);
    await this.app.vault.process(file, change);
  }

  async writeBinary(path: string, data: ArrayBuffer): Promise<void> {
    const existing = this.app.vault.getFileByPath(path);
    if (existing) await this.app.vault.modifyBinary(existing, data);
    else await this.app.vault.createBinary(path, data);
  }

  async remove(path: string): Promise<void> {
    const file = this.app.vault.getFileByPath(path);
    if (file) await trashVaultItem(this.app, file);
  }

  async removeFolderIfEmpty(folder: string): Promise<void> {
    const found = this.app.vault.getFolderByPath(folder);
    if (found && found.children.length === 0) await trashVaultItem(this.app, found);
  }

  resourceUrl(path: string): string | null {
    const file = this.app.vault.getFileByPath(path);
    return file ? this.app.vault.getResourcePath(file) : null;
  }
}

class HiddenSnapshotStorage implements SnapshotStorage {
  constructor(private readonly app: App) {}

  async list(folder: string): Promise<string[]> {
    return (await this.app.vault.adapter.exists(folder)) ? (await this.app.vault.adapter.list(folder)).files : [];
  }

  async read(path: string): Promise<string | null> {
    return (await this.app.vault.adapter.exists(path)) ? this.app.vault.adapter.read(path) : null;
  }

  async create(path: string, content: string): Promise<void> {
    await ensureAdapterFolder(this.app, parentPath(path));
    await this.app.vault.adapter.write(path, content);
  }

  async update(path: string, change: (content: string) => string): Promise<void> {
    const content = await this.read(path);
    if (content === null) throw new Error(`Snapshot file not found: ${path}`);
    await this.app.vault.adapter.write(path, change(content));
  }

  async writeBinary(path: string, data: ArrayBuffer): Promise<void> {
    await ensureAdapterFolder(this.app, parentPath(path));
    await this.app.vault.adapter.writeBinary(path, data);
  }

  async remove(path: string): Promise<void> {
    await trashHiddenPath(this.app, path);
  }

  async removeFolderIfEmpty(folder: string): Promise<void> {
    // Up to the folder that holds the map, so an emptied `.snapshots` goes too.
    await removeEmptyHiddenFolders(this.app, folder, parentPath(parentPath(folder)));
  }

  resourceUrl(path: string): string | null {
    return this.app.vault.adapter.getResourcePath(path);
  }
}

/** The storage for the snapshot folder or file at `path`. */
export function snapshotStorageFor(app: App, path: string): SnapshotStorage {
  return isHiddenVaultPath(path) ? new HiddenSnapshotStorage(app) : new VaultSnapshotStorage(app);
}
