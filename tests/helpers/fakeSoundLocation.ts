import type { SoundFileEntry, SoundListing, SoundLocation } from '../../src/app/soundLibrary/soundLocation';
import { SoundPathTakenError, sortedListing } from '../../src/app/soundLibrary/soundLocation';
import { isWithin, joinRelative, nameOfRelative, parentOfRelative } from '../../src/app/soundLibrary/soundPaths';

/** A root held in memory: a test of what is shown, where no disk can be reached. */
export class FakeSoundLocation implements SoundLocation {
  readonly files = new Map<string, SoundFileEntry>();
  readonly folders = new Set<string>(['']);
  readonly reads: string[] = [];
  /** What was written, by path: a read gives it back. */
  readonly contents = new Map<string, Blob>();
  /** Every change in order: `write a`, `move a b`, `trash a`. */
  readonly changes: string[] = [];
  /** Ranges read, as `path start-end`. */
  readonly ranges: string[] = [];
  trashable = true;
  /** Lets a change fail: return an error to throw it. */
  failing: (change: string) => Error | null = () => null;
  private readonly watchers = new Set<(path: string | null) => void>();
  /** What a read gives; a read of a path it never answers stays unfinished, as a long conversion does. */
  blobOf: (path: string) => Promise<Blob> = async () => new Blob(['AUDIO']);

  /** How many watch it now. */
  get watching(): number {
    return this.watchers.size;
  }

  /** A file with bytes of its own. */
  put(path: string, content: Blob, mtime = 1): void {
    this.addFile(path, content.size);
    this.contents.set(path, content);
    const entry = this.files.get(path);
    if (entry) this.files.set(path, { ...entry, mtime });
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
    return this.contents.get(path) ? Promise.resolve(this.contents.get(path) as Blob) : this.blobOf(path);
  }

  async readRange(path: string, start: number, end: number): Promise<Uint8Array<ArrayBuffer>> {
    this.ranges.push(`${path} ${start}-${end}`);
    const blob = this.contents.get(path) ?? (await this.blobOf(path));
    return new Uint8Array(await blob.slice(start, end).arrayBuffer());
  }

  private change(change: string): void {
    const failure = this.failing(change);
    if (failure) throw failure;
    this.changes.push(change);
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
    this.change(`move ${from} ${to}`);
    for (const [path, content] of [...this.contents]) {
      if (!isWithin(from, path)) continue;
      this.contents.delete(path);
      this.contents.set(path === from ? to : joinRelative(to, path.slice(from.length + 1)), content);
    }
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
    this.change(`write ${path}`);
    this.addFile(path, content.size);
    this.contents.set(path, content);
    this.tell(path);
  }

  canTrash(): boolean {
    return this.trashable;
  }

  canWrite(): Promise<boolean> {
    return Promise.resolve(true);
  }

  async trash(path: string): Promise<void> {
    this.change(`trash ${path}`);
    for (const file of [...this.files.keys()]) if (isWithin(path, file)) this.files.delete(file);
    for (const file of [...this.contents.keys()]) if (isWithin(path, file)) this.contents.delete(file);
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
