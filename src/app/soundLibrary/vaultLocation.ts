import { normalizePath, TFile, TFolder, type App, type EventRef, type TAbstractFile } from 'obsidian';
import { ensureFolder, isPathTaken } from '../plugin/vaultFolders';
import { ATLAS_VTT_DIR } from '../services/assetPaths';
import { isAudioPath } from './soundFiles';
import { joinRelative, relativeBelow, safeRelative } from './soundPaths';
import { SoundPathError, SoundPathTakenError, sortedListing, type SoundFileEntry, type SoundFolderEntry, type SoundListing, type SoundLocation } from './soundLocation';

/** Atlas' own folder holds video maps and record files, never the GM's library, but for the default folders. */
const isAtlasOwn = (path: string): boolean => path.startsWith(`${ATLAS_VTT_DIR}/`) && path !== `${ATLAS_VTT_DIR}/sounds` && !path.startsWith(`${ATLAS_VTT_DIR}/sounds/`);

/** A linked folder in the vault. Moves go through `fileManager`, so whatever names a file follows it, and deleting goes where the GM's trash setting says. */
export class VaultLocation implements SoundLocation {
  constructor(private readonly app: App, private readonly root: string) {}

  private vaultPath(path: string): string {
    const safe = safeRelative(path);
    if (safe === null) throw new SoundPathError(path);
    return normalizePath(safe === '' ? this.root || '/' : joinRelative(this.root, safe));
  }

  private entry(path: string): TAbstractFile | null {
    return this.app.vault.getAbstractFileByPath(this.vaultPath(path));
  }

  async list(folder: string): Promise<SoundListing | null> {
    const here = this.root === '' && folder === '' ? this.app.vault.getRoot() : this.entry(folder);
    if (!(here instanceof TFolder)) return null;
    const folders: SoundFolderEntry[] = [];
    const files: SoundFileEntry[] = [];
    for (const child of here.children) {
      if (child.name.startsWith('.') || safeRelative(child.name) === null || isAtlasOwn(child.path)) continue;
      const path = joinRelative(folder, child.name);
      if (child instanceof TFolder) folders.push({ name: child.name, path });
      else if (child instanceof TFile && isAudioPath(child.name)) files.push({ name: child.name, path, size: child.stat.size, mtime: child.stat.mtime });
    }
    return sortedListing(folders, files);
  }

  exists(path: string): Promise<boolean> {
    return Promise.resolve(isPathTaken(this.app, this.vaultPath(path)));
  }

  async read(path: string): Promise<Blob> {
    const file = this.entry(path);
    if (!(file instanceof TFile)) throw new Error(`${path} is not in the vault.`);
    return new Blob([await this.app.vault.readBinary(file)]);
  }

  resourceUrl(path: string): string | null {
    const file = this.entry(path);
    return file instanceof TFile ? this.app.vault.getResourcePath(file) : null;
  }

  async makeFolder(path: string): Promise<void> {
    await ensureFolder(this.app, this.vaultPath(path));
  }

  async move(from: string, to: string): Promise<void> {
    const file = this.entry(from);
    if (!file) throw new Error(`${from} is not in the vault.`);
    const target = this.vaultPath(to);
    const sameButCase = target.toLowerCase() === file.path.toLowerCase();
    if (isPathTaken(this.app, target) && !sameButCase) throw new SoundPathTakenError(to);
    await this.app.fileManager.renameFile(file, target);
  }

  /** Where a path below this root lies in the vault. */
  fullPath(path: string): string {
    return this.vaultPath(path);
  }

  /** Moves a file or folder of this root to any vault path, so that what names it follows, also into the other root. */
  async moveToVault(from: string, target: string): Promise<void> {
    const file = this.entry(from);
    if (!file) throw new Error(`${from} is not in the vault.`);
    if (isPathTaken(this.app, target)) throw new SoundPathTakenError(target);
    await this.app.fileManager.renameFile(file, target);
  }

  async write(path: string, content: Blob): Promise<void> {
    const target = this.vaultPath(path);
    if (isPathTaken(this.app, target)) throw new SoundPathTakenError(path);
    await this.app.vault.createBinary(target, await content.arrayBuffer());
  }

  async trash(path: string): Promise<void> {
    const file = this.entry(path);
    if (file) await this.app.fileManager.trashFile(file);
  }

  watch(onChange: (path: string | null) => void): () => void {
    const inRoot = (path: string): string | null => relativeBelow(this.root, path) ?? (this.root === '' ? path : null);
    const heard = (file: TAbstractFile, oldPath?: string): void => {
      for (const path of [file.path, oldPath]) {
        const below = path === undefined ? null : inRoot(path);
        if (below !== null) onChange(below === '' ? null : below);
      }
    };
    const { vault } = this.app;
    const refs: EventRef[] = [vault.on('create', (file) => heard(file)), vault.on('delete', (file) => heard(file)), vault.on('modify', (file) => heard(file)), vault.on('rename', heard)];
    return () => refs.forEach((ref) => vault.offref(ref));
  }
}
