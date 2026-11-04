import { TFile, TFolder, type App } from 'obsidian';
import type { AtlasView } from '../../atlas-view';
import { ATLAS_VIEW_TYPE, isAtlasView } from '../../atlasViewType';
import { ensureAdapterFolder, ensureFolder } from '../../plugin/vaultFolders';
import { isHiddenVaultPath, readVaultBinary, removeEmptyHiddenFolders, trashHiddenPath } from '../../utils/hiddenVaultFiles';
import { parentPath } from '../../utils/pathUtils';
import { COLLECTION_DATA_DIR } from './installRecord';

interface JournalEntry {
  path: string;
  /** Where the file's previous content was backed up; null when the import created the file. */
  backup: string | null;
}

/** `2026-09-23 19-30-05`: sortable, and valid as a folder name everywhere. */
function timestamp(date: Date): string {
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
}

/**
 * Writes and removes vault files for an import so that it can be undone: every
 * file it replaces or deletes is first copied to a hidden backup folder, and
 * `rollback` restores those copies and removes the files it created. Files in
 * hidden folders (snapshots earlier versions installed) are handled through the adapter.
 */
export class ImportJournal {
  private readonly entries: JournalEntry[] = [];
  private readonly backupFolders = new Set<string>();
  /** The first backup of each path; a path touched twice keeps its original content. */
  private readonly backups = new Map<string, string | null>();
  /** Folders the import created, outermost first, so a rollback can remove them again. */
  private readonly createdFolders: string[] = [];
  readonly backupFolder: string;

  constructor(private readonly app: App, collectionId: string) {
    this.backupFolder = `${COLLECTION_DATA_DIR}/backups/${collectionId}/${timestamp(new Date())}`;
  }

  /** How many files were backed up. */
  get backupCount(): number {
    return [...this.backups.values()].filter((backup) => backup !== null).length;
  }

  async write(path: string, content: ArrayBuffer): Promise<void> {
    if (!(await this.prepare(path))) {
      await this.ensureFolderRecorded(parentPath(path));
      this.backups.set(path, null);
      this.entries.push({ path, backup: null });
    }
    await this.writeFile(path, content);
  }

  async remove(path: string): Promise<void> {
    if (await this.prepare(path)) await this.trash(path);
  }

  /** Undoes every write and removal, newest first. Returns the paths it could not restore. */
  async rollback(): Promise<string[]> {
    const failed: string[] = [];
    for (const entry of [...this.entries].reverse()) {
      try {
        if (entry.backup === null) {
          await this.trash(entry.path);
          continue;
        }
        const content = await this.app.vault.adapter.readBinary(entry.backup);
        if (!(await this.exists(entry.path))) await this.createFolder(parentPath(entry.path));
        await this.writeFile(entry.path, content);
      } catch (error) {
        console.error(`[ImportJournal] Could not restore ${entry.path}:`, error);
        failed.push(entry.path);
      }
    }
    this.entries.length = 0;
    // Folders the import created and left empty go too, so a retry lands exactly where this attempt would have.
    for (const path of [...this.createdFolders].reverse()) {
      if (isHiddenVaultPath(path)) {
        await removeEmptyHiddenFolders(this.app, path, parentPath(path));
        continue;
      }
      const folder = this.app.vault.getAbstractFileByPath(path);
      if (folder instanceof TFolder && folder.children.length === 0) await this.app.fileManager.trashFile(folder);
    }
    return failed;
  }

  private async ensureFolderRecorded(path: string): Promise<void> {
    const missing: string[] = [];
    for (let folder = path; folder && !(await this.exists(folder)); folder = parentPath(folder)) missing.unshift(folder);
    await this.createFolder(path);
    this.createdFolders.push(...missing);
  }

  /** Whether a file or folder exists at `path`, including in hidden folders the vault does not index. */
  private async exists(path: string): Promise<boolean> {
    if (this.app.vault.getAbstractFileByPath(path)) return true;
    return isHiddenVaultPath(path) && this.app.vault.adapter.exists(path);
  }

  /** Creates the folder through the vault, and its hidden part through the adapter. */
  private async createFolder(path: string): Promise<void> {
    const segments = path.split('/');
    const firstHidden = segments.findIndex((segment) => segment.startsWith('.'));
    if (firstHidden === -1) {
      await ensureFolder(this.app, path);
      return;
    }
    if (firstHidden > 0) await ensureFolder(this.app, segments.slice(0, firstHidden).join('/'));
    await ensureAdapterFolder(this.app, path);
  }

  private async writeFile(path: string, content: ArrayBuffer): Promise<void> {
    const existing = this.app.vault.getAbstractFileByPath(path);
    if (existing instanceof TFile) await this.app.vault.modifyBinary(existing, content);
    else if (isHiddenVaultPath(path)) await this.app.vault.adapter.writeBinary(path, content);
    else await this.app.vault.createBinary(path, content);
  }

  private async trash(path: string): Promise<void> {
    const existing = this.app.vault.getAbstractFileByPath(path);
    if (existing instanceof TFile) await this.app.fileManager.trashFile(existing);
    else if (isHiddenVaultPath(path)) await trashHiddenPath(this.app, path);
  }

  /**
   * Saves and closes map views of `path`, backs the file up the first time the
   * import touches it and journals the change; returns whether the file exists.
   */
  private async prepare(path: string): Promise<boolean> {
    await forOpenMaps(this.app, (file) => file === path, async (view, detach) => {
      await view.saveMap();
      detach();
    });
    const existing = this.app.vault.getAbstractFileByPath(path);
    if (existing && !(existing instanceof TFile)) return false;
    let backup = this.backups.get(path);
    if (backup === undefined) {
      const content = await readVaultBinary(this.app, path);
      if (!content) return false;
      backup = `${this.backupFolder}/${path}`;
      await ensureAdapterFolder(this.app, parentPath(backup), this.backupFolders);
      await this.app.vault.adapter.writeBinary(backup, content);
      this.backups.set(path, backup);
    } else if (!(await this.exists(path))) {
      return false;
    }
    this.entries.push({ path, backup });
    return true;
  }
}

/** Calls `visit` for every open Atlas view whose map `matches`, with a way to close it. */
async function forOpenMaps(app: App, matches: (file: string) => boolean, visit: (view: AtlasView, detach: () => void) => Promise<void>): Promise<void> {
  for (const leaf of app.workspace.getLeavesOfType(ATLAS_VIEW_TYPE)) {
    const file = leaf.view.getState().file;
    if (typeof file === 'string' && matches(file) && isAtlasView(leaf.view)) await visit(leaf.view, () => leaf.detach());
  }
}

/** Writes pending saves of open views of `paths`, so the vault holds what the user sees before it is compared. */
export async function saveOpenMaps(app: App, paths: ReadonlySet<string>): Promise<void> {
  await forOpenMaps(app, (file) => paths.has(file), (view) => view.saveMap());
}
