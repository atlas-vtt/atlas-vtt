import type { SoundFileEntry, SoundListing, SoundLocation } from '../../src/app/soundLibrary/soundLocation';
import { SoundPathTakenError, sortedListing } from '../../src/app/soundLibrary/soundLocation';
import { isWithin, joinRelative, nameOfRelative, parentOfRelative } from '../../src/app/soundLibrary/soundPaths';

/** A root held in memory: a test of what is shown, where no disk can be reached. */
export class FakeSoundLocation implements SoundLocation {
  readonly files = new Map<string, SoundFileEntry>();
  readonly folders = new Set<string>(['']);
  readonly reads: string[] = [];
  private readonly watchers = new Set<(path: string | null) => void>();
  /** What a read gives; a read of a path it never answers stays unfinished, as a long conversion does. */
  blobOf: (path: string) => Promise<Blob> = async () => new Blob(['AUDIO']);

  /** How many watch it now. */
  get watching(): number {
    return this.watchers.size;
  }

  addFile(path: string, size = 5_000_000): void {
    for (let at = parentOfRelative(path); at !== ''; at = parentOfRelative(at)) this.folders.add(at);
    this.files.set(path, { name: nameOfRelative(path), path, size, mtime: 1 });
  }

  addFolder(path: string): void {
    this.folders.add(path);
  }

  async list(folder: string): Promise<SoundListing | null> {
    if (!this.folders.has(folder)) return null;
    const folders = [...this.folders].filter((path) => path !== '' && parentOfRelative(path) === folder).map((path) => ({ name: nameOfRelative(path), path }));
    const files = [...this.files.values()].filter((file) => parentOfRelative(file.path) === folder);
    return sortedListing(folders, files);
  }

  async stat(path: string): Promise<{ size: number; mtime: number } | null> {
    return this.files.get(path) ?? null;
  }

  async exists(path: string): Promise<boolean> {
    return this.files.has(path) || this.folders.has(path);
  }

  read(path: string): Promise<Blob> {
    this.reads.push(path);
    return this.blobOf(path);
  }

  resourceUrl(path: string): string | null {
    return `fake://${path}`;
  }

  async makeFolder(path: string): Promise<void> {
    this.folders.add(path);
    this.tell(path);
  }

  async move(from: string, to: string): Promise<void> {
    if (await this.exists(to)) throw new SoundPathTakenError(to);
    for (const [path, file] of [...this.files]) {
      if (!isWithin(from, path)) continue;
      this.files.delete(path);
      const target = joinRelative(to, path.slice(from.length + 1));
      const moved = path === from ? to : target;
      this.files.set(moved, { ...file, path: moved, name: nameOfRelative(moved) });
    }
    for (const folder of [...this.folders]) {
      if (folder === '' || !isWithin(from, folder)) continue;
      this.folders.delete(folder);
      this.folders.add(folder === from ? to : joinRelative(to, folder.slice(from.length + 1)));
    }
    this.tell(from);
    this.tell(to);
  }

  async write(path: string, content: Blob): Promise<void> {
    if (await this.exists(path)) throw new SoundPathTakenError(path);
    this.addFile(path, content.size);
    this.tell(path);
  }

  async trash(path: string): Promise<void> {
    for (const file of [...this.files.keys()]) if (isWithin(path, file)) this.files.delete(file);
    for (const folder of [...this.folders]) if (folder !== '' && isWithin(path, folder)) this.folders.delete(folder);
    this.tell(path);
  }

  watch(onChange: (path: string | null) => void): () => void {
    this.watchers.add(onChange);
    return () => this.watchers.delete(onChange);
  }

  private tell(path: string): void {
    for (const watcher of this.watchers) watcher(path);
  }
}
