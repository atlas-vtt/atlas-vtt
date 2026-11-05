import { isAudioPath } from './soundFiles';
import type { NodeFiles, NodeStat } from './nodeFiles';
import { isListableName, joinRelative, safeRelative } from './soundPaths';
import { SoundPathError, SoundPathTakenError, SoundVaultPathError, sortedListing, TrashUnavailableError, type SoundFileEntry, type SoundFolderEntry, type SoundListing, type SoundLocation } from './soundLocation';
import { readAsBlob, writeFromBlob } from './externalBytes';

const isMissing = (error: unknown): boolean => {
  const code: unknown = error instanceof Object ? Reflect.get(error, 'code') : undefined;
  return code === 'ENOENT' || code === 'ENOTDIR';
};

/** How many entries of a folder are looked at at once. */
const STAT_BATCH = 32;

export interface ExternalLocationDeps {
  files: NodeFiles;
  /** Moves a path to the system's trash; null where this Obsidian has none. */
  trashItem: ((absolute: string) => Promise<void>) | null;
  /** A URL a media element can load for an absolute path; null where there is none. */
  resourceUrl: ((absolute: string) => string) | null;
  /** The vault's folder on this device, which a root above it must never show or change; null where it has none on a disk. */
  vaultFolder: string | null;
}

/** A linked folder outside the vault. Nothing is reached but through a path checked against the root and the vault, its symbolic links resolved. */
export class ExternalLocation implements SoundLocation {
  private realVaultFolder: Promise<string | null> | null = null;

  constructor(private readonly root: string, private readonly deps: ExternalLocationDeps) {}

  private get fs(): NodeFiles['fs']['promises'] {
    return this.deps.files.fs.promises;
  }

  private plain(path: string): string {
    const safe = safeRelative(path);
    if (safe === null) throw new SoundPathError(path);
    return safe === '' ? this.root : `${this.root}${this.deps.files.sep}${safe.split('/').join(this.deps.files.sep)}`;
  }

  private isBelowRoot(realRoot: string, real: string): boolean {
    return real === realRoot || real.startsWith(realRoot.endsWith(this.deps.files.sep) ? realRoot : `${realRoot}${this.deps.files.sep}`);
  }

  private realVault(): Promise<string | null> {
    const { vaultFolder } = this.deps;
    this.realVaultFolder ??= vaultFolder === null ? Promise.resolve(null) : this.fs.realpath(vaultFolder).catch(() => vaultFolder);
    return this.realVaultFolder;
  }

  /** The absolute path of `path`, once what exists of it is known to lie in the root and not in the vault: a symbolic link may lead anywhere. */
  private async absolute(path: string): Promise<string> {
    const plain = this.plain(path);
    const realRoot = await this.fs.realpath(this.root);
    const vault = await this.realVault();
    let existing = path;
    for (;;) {
      try {
        const real = await this.fs.realpath(this.plain(existing));
        if (!this.isBelowRoot(realRoot, real)) throw new SoundPathError(path);
        if (vault !== null && this.isBelowRoot(vault, real)) throw new SoundVaultPathError(path);
        return plain;
      } catch (error) {
        if (!isMissing(error)) throw error;
        if (existing === '') throw error;
        const slash = existing.lastIndexOf('/');
        existing = slash < 0 ? '' : existing.slice(0, slash);
      }
    }
  }

  /** The absolute path of what may go or be moved away: a folder that holds the vault takes the vault along. */
  private async removable(path: string): Promise<string> {
    const absolute = await this.absolute(path);
    const vault = await this.realVault();
    if (vault !== null && this.isBelowRoot(await this.fs.realpath(absolute), vault)) throw new SoundVaultPathError(path);
    return absolute;
  }

  private async isVaultIn(realFolder: string, name: string): Promise<boolean> {
    return `${realFolder}${this.deps.files.sep}${name}` === (await this.realVault());
  }

  async list(folder: string): Promise<SoundListing | null> {
    let entries;
    let realFolder;
    try {
      const absolute = await this.absolute(folder);
      realFolder = await this.fs.realpath(absolute);
      entries = await this.fs.readdir(absolute, { withFileTypes: true });
    } catch (error) {
      if (isMissing(error) || error instanceof SoundVaultPathError) return null;
      throw error;
    }
    const folders: SoundFolderEntry[] = [];
    const files: SoundFileEntry[] = [];
    const wanted = entries.filter((entry) => isListableName(entry.name));
    for (let start = 0; start < wanted.length; start += STAT_BATCH) {
      await Promise.all(wanted.slice(start, start + STAT_BATCH).map(async (entry) => {
        const path = joinRelative(folder, entry.name);
        if (entry.isDirectory() && (await this.isVaultIn(realFolder, entry.name))) return;
        const stat = entry.isDirectory() || entry.isFile() ? await this.statIfThere(path, entry.isFile()) : await this.linked(path);
        if (!stat) return;
        if (stat.isDirectory()) folders.push({ name: entry.name, path });
        else if (stat.isFile() && isAudioPath(entry.name)) files.push({ name: entry.name, path, size: stat.size, mtime: stat.mtimeMs });
      }));
    }
    return sortedListing(folders, files);
  }

  /** A plain folder needs no stat: its entry said what it is. A file's size is what is asked for. */
  private async statIfThere(path: string, isFile: boolean): Promise<NodeStat | null> {
    if (!isFile) return { size: 0, mtimeMs: 0, isDirectory: () => true, isFile: () => false };
    if (!isAudioPath(path)) return null;
    try {
      return await this.fs.stat(this.plain(path));
    } catch (error) {
      if (isMissing(error)) return null;
      throw error;
    }
  }

  /** What a symbolic link leads to, if that lies in the root. One that leads out is not there at all. */
  private async linked(path: string): Promise<NodeStat | null> {
    try {
      return await this.fs.stat(await this.absolute(path));
    } catch (error) {
      if (isMissing(error) || error instanceof SoundPathError || error instanceof SoundVaultPathError) return null;
      throw error;
    }
  }

  async stat(path: string): Promise<{ size: number; mtime: number } | null> {
    try {
      const stat = await this.fs.stat(await this.absolute(path));
      return { size: stat.size, mtime: stat.mtimeMs };
    } catch (error) {
      if (isMissing(error) || error instanceof SoundVaultPathError) return null;
      throw error;
    }
  }

  async exists(path: string): Promise<boolean> {
    return (await this.stat(path)) !== null;
  }

  async read(path: string, onStep?: () => void): Promise<Blob> {
    const absolute = await this.absolute(path);
    return readAsBlob(this.deps.files.fs, absolute, onStep);
  }

  resourceUrl(path: string): string | null {
    return this.deps.resourceUrl?.(this.plain(path)) ?? null;
  }

  async makeFolder(path: string): Promise<void> {
    await this.fs.mkdir(await this.absolute(path), { recursive: true });
  }

  /** `rename` would replace a file at `to`, so that is ruled out first. Another program writing there in between is the one case left open. */
  async move(from: string, to: string): Promise<void> {
    const source = await this.removable(from);
    const target = await this.absolute(to);
    if (await this.exists(to) && !(await this.isSameFile(source, target))) throw new SoundPathTakenError(to);
    await this.fs.rename(source, target);
  }

  /** A rename that changes only the case of a name, where the system does not tell them apart. */
  private async isSameFile(a: string, b: string): Promise<boolean> {
    return (await this.fs.realpath(a)) === (await this.fs.realpath(b));
  }

  async write(path: string, content: Blob): Promise<void> {
    const target = await this.absolute(path);
    await writeFromBlob(this.deps.files.fs, target, content, path);
  }

  async trash(path: string): Promise<void> {
    const { trashItem } = this.deps;
    if (!trashItem) throw new TrashUnavailableError();
    await trashItem(await this.removable(path));
  }

  /** Linux' recursive watch costs a watch per folder on older systems, and a system without one throws: the rescan on opening the library and on returning to the window covers it. */
  watch(onChange: (path: string | null) => void): () => void {
    try {
      const { sep } = this.deps.files;
      const watcher = this.deps.files.fs.watch(this.root, { recursive: true }, (_event, name) => {
        const path = typeof name === 'string' ? safeRelative(name.split(sep).join('/')) : null;
        onChange(path);
      });
      watcher.on('error', () => onChange(null));
      return () => watcher.close();
    } catch {
      return () => undefined;
    }
  }
}
