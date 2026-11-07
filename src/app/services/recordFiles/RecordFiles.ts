import { TAbstractFile, TFile, type App, type EventRef } from 'obsidian';
import { isWithin, type RecordLayout, type StoredRecord } from './recordLayout';

export type { RecordLayout, StoredRecord } from './recordLayout';

interface RecordFile<Stored> {
  text: string;
  /** Null for a file that holds no record (broken JSON, no id). */
  record: Stored | null;
}

const parentOf = (path: string): string => path.slice(0, path.lastIndexOf('/'));

/**
 * Records kept as vault files, one per record, so they sync and travel like any other file. It
 * follows creates, edits, deletes and renames (a sync delivering another device's change),
 * recognises its own writes by their text and tells its listeners about every change. Where two
 * files hold one id (a conflict copy) the lower path holds it. Edits are taken in at once and
 * written in order in the background (`flush`); a file is changed by applying the edit to what it
 * holds then, so a field another device wrote survives. A renamed record's file (or folder) takes
 * the new name.
 */
export class RecordFiles<Stored extends StoredRecord> {
  private readonly files = new Map<string, RecordFile<Stored>>();
  /** Raised for a path whenever an event makes a read of it under way stale. */
  private readonly versions = new Map<string, number>();
  private readonly listeners = new Set<() => void>();
  private readonly refs: EventRef[] = [];
  private cache: Stored[] | null = null;
  private writes: Promise<void> = Promise.resolve();
  private loading: Promise<void> | null = null;
  private loaded = false;

  protected constructor(protected readonly app: App, private readonly layout: RecordLayout<Stored>) {
    const { vault } = app;
    this.refs.push(
      vault.on('create', (file) => this.written(file)),
      vault.on('modify', (file) => this.written(file)),
      vault.on('delete', (file) => this.deleted(file.path)),
      vault.on('rename', (file, oldPath) => this.renamed(file, oldPath)),
    );
  }

  /** Reads the records' folder once, through the adapter, which does not wait for the vault's index. */
  load(): Promise<void> {
    return (this.loading ??= this.readFolder(this.layout.root).finally(() => {
      this.loaded = true;
      this.changed();
    }));
  }

  /** Whether the records' folder was read once (`load`), so the entries are what the vault holds. */
  isLoaded(): boolean {
    return this.loaded;
  }

  /** The stored records, the first file per id by path; the same array while nothing changed. */
  entries(): readonly Stored[] {
    if (this.cache) return this.cache;
    const seen = new Set<string>();
    this.cache = this.holders().flatMap((path) => {
      const record = this.files.get(path)?.record;
      if (!record || seen.has(record.id)) return [];
      seen.add(record.id);
      return [record];
    });
    return this.cache;
  }

  /** The file that holds the record `id`, or null when none does. */
  pathOf(id: string): string | null {
    return this.holders().find((path) => this.files.get(path)?.record?.id === id) ?? null;
  }

  /** The record files in the order they hold an id: those named after their record first where the layout says so, then by path. */
  private holders(): string[] {
    const paths = [...this.files.keys()].sort();
    if (this.layout.namedHolds !== true) return paths;
    const named = (path: string): boolean => this.layout.isNamedAfter(this.layout.namedPath(path), this.files.get(path)?.record?.name);
    return [...paths.filter(named), ...paths.filter((path) => !named(path))];
  }

  /** Writes a new record under `name` (its record's own name where none is given). */
  create(record: Stored, name: unknown = record.name): void {
    const path = this.layout.recordPathIn(this.layout.freeNamedPath(name, (candidate) => this.isTaken(candidate)));
    this.bump(path);
    this.files.set(path, { text: this.layout.text(record), record });
    this.changed();
    this.enqueue(() => this.writeNew(record.id));
  }

  /**
   * Writes a new record at `path`, a record file the layout names after nothing (one that lives in
   * another record's folder). Should a file already stand there once it is written (another
   * device's, delivered meanwhile), `change` is applied to what it holds instead.
   */
  createAt(path: string, record: Stored, change: (stored: Stored) => Stored): void {
    if (!this.layout.isRecordPath(path)) throw new Error(`Not a ${this.layout.kind} file: ${path}`);
    this.bump(path);
    this.files.set(path, { text: this.layout.text(record), record });
    this.changed();
    this.enqueue(() => this.writeAt(path, change));
  }

  /** Changes the record; on disk the change is applied to what the file holds then. */
  update(id: string, change: (stored: Stored) => Stored): void {
    const path = this.pathOf(id);
    const record = path ? this.files.get(path)?.record : null;
    if (!path || !record) throw new Error(`No ${this.layout.kind} file holds ${id}`);
    const next = change(record);
    this.bump(path);
    this.files.set(path, { text: this.layout.text(next), record: next });
    this.changed();
    this.enqueue(() => this.writeChange(id, change));
  }

  /** Removes every file (or folder) that holds the record, conflict copies included, so none brings it back. */
  remove(id: string): void {
    const paths = [...this.files.keys()].filter((path) => this.files.get(path)?.record?.id === id);
    if (paths.length === 0) return;
    for (const path of paths) this.files.delete(path);
    this.changed();
    this.enqueue(async () => {
      for (const path of paths) {
        const named = this.app.vault.getAbstractFileByPath(this.layout.namedPath(path));
        if (named) await this.app.fileManager.trashFile(named);
      }
    });
  }

  /** Text another part of Atlas has just written to a record file, taken in without waiting for the vault's event. */
  recordWrite(path: string, text: string): void {
    if (!this.layout.isRecordPath(path) || this.files.get(path)?.text === text) return;
    this.bump(path);
    this.files.set(path, { text, record: this.layout.read(text) });
    this.changed();
  }

  /** The record `id` as the disk holds it now, read back through the adapter; null when no file holds it or it cannot be read. */
  async onDisk(id: string): Promise<Stored | null> {
    const path = this.pathOf(id);
    if (path === null) return null;
    try {
      const read = this.layout.read(await this.app.vault.adapter.read(path));
      return read?.id === id ? read : null;
    } catch {
      return null;
    }
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  /** Settles once every edit made so far is on disk. */
  flush(): Promise<void> {
    return this.writes;
  }

  destroy(): void {
    for (const ref of this.refs.splice(0)) this.app.vault.offref(ref);
    this.listeners.clear();
  }

  private enqueue(write: () => Promise<void>): void {
    this.writes = this.writes.then(write).catch((error: unknown) => {
      console.error(`[Atlas] Writing a ${this.layout.kind} file failed:`, error);
    });
  }

  private async writeNew(id: string): Promise<void> {
    let path = this.pathOf(id);
    const entry = path ? this.files.get(path) : undefined;
    if (!path || !entry) return;
    const { vault } = this.app;
    if (vault.getAbstractFileByPath(this.layout.namedPath(path))) {
      // Another file took the name meanwhile (a sync); this one takes the next free name.
      this.files.delete(path);
      path = this.layout.recordPathIn(this.layout.freeNamedPath(entry.record?.name, (candidate) => this.isTaken(candidate)));
      this.files.set(path, entry);
    }
    await this.ensureFolder(parentOf(path));
    await vault.create(path, entry.text);
  }

  private async writeAt(path: string, change: (stored: Stored) => Stored): Promise<void> {
    const entry = this.files.get(path);
    const id = entry?.record?.id;
    if (!entry || id === undefined) return;
    if (this.app.vault.getFileByPath(path)) return this.writeChange(id, change);
    await this.ensureFolder(parentOf(path));
    await this.app.vault.create(path, entry.text);
  }

  private async ensureFolder(folder: string): Promise<void> {
    if (folder === '' || this.app.vault.getFolderByPath(folder)) return;
    await this.ensureFolder(parentOf(folder));
    await this.app.vault.createFolder(folder).catch(() => undefined);
  }

  private async writeChange(id: string, change: (stored: Stored) => Stored): Promise<void> {
    const path = this.pathOf(id);
    const file = path ? this.app.vault.getFileByPath(path) : null;
    if (!path || !file) return;
    let written = '';
    await this.app.vault.process(file, (text) => {
      const onDisk = this.layout.read(text);
      // A file that no longer holds the record is left as it is.
      written = onDisk?.id === id ? this.layout.text(change(onDisk)) : text;
      return written;
    });
    if (this.files.get(path)?.text !== written) {
      this.files.set(path, { text: written, record: this.layout.read(written) });
      this.changed();
    }
    await this.followName(id, path);
  }

  /** A renamed record's file or folder takes the new name. */
  private async followName(id: string, path: string): Promise<void> {
    const name = this.files.get(path)?.record?.name;
    const named = this.layout.namedPath(path);
    if (this.pathOf(id) !== path || this.layout.isNamedAfter(named, name)) return;
    const target = this.layout.freeNamedPath(name, (candidate) => this.isTaken(candidate, named));
    const file = this.app.vault.getAbstractFileByPath(named);
    if (target === named || !file) return;
    await this.app.fileManager.renameFile(file, target);
    this.move(path, this.layout.recordPathIn(target));
  }

  private isTaken(path: string, except: string | null = null): boolean {
    const lower = path.toLowerCase();
    if (except !== null && except.toLowerCase() === lower) return false;
    if ([...this.files.keys()].some((known) => isWithin(known.toLowerCase(), lower))) return true;
    if (this.app.vault.getAbstractFileByPath(path)) return true;
    const siblings = this.app.vault.getFolderByPath(parentOf(path))?.children ?? [];
    return siblings.some((child) => child.path.toLowerCase() === lower);
  }

  private async readFolder(folder: string): Promise<void> {
    const { adapter } = this.app.vault;
    if (!(await adapter.exists(folder))) return;
    const listed = await adapter.list(folder);
    for (const path of listed.files) if (this.layout.isRecordPath(path)) await this.read(path, () => adapter.read(path));
    for (const child of listed.folders) await this.readFolder(child);
  }

  private written(file: TAbstractFile): void {
    if (!(file instanceof TFile) || !this.layout.isRecordPath(file.path)) return;
    void this.read(file.path, () => this.app.vault.read(file));
  }

  private async read(path: string, text: () => Promise<string>): Promise<void> {
    const version = this.bump(path);
    let read: string;
    try {
      read = await text();
    } catch (error) {
      console.error(`[Atlas] Could not read the ${this.layout.kind} ${path}:`, error);
      return;
    }
    if (this.versions.get(path) !== version || this.files.get(path)?.text === read) return;
    this.files.set(path, { text: read, record: this.layout.read(read) });
    this.changed();
  }

  private deleted(path: string): void {
    const gone = [...this.files.keys()].filter((known) => isWithin(known, path));
    for (const known of gone) {
      this.bump(known);
      this.files.delete(known);
    }
    if (gone.length > 0) this.changed();
  }

  /** Files move without being read again; a file moved in from elsewhere is read. */
  private renamed(file: TAbstractFile, oldPath: string): void {
    const moved = [...this.files.keys()].filter((known) => isWithin(known, oldPath));
    for (const known of moved) this.move(known, file.path + known.slice(oldPath.length));
    const arrived = file instanceof TFile ? [file] : this.app.vault.getFiles().filter((child) => isWithin(child.path, file.path));
    for (const child of arrived) if (!this.files.has(child.path)) this.written(child);
  }

  private move(from: string, to: string): void {
    const entry = this.files.get(from);
    if (!entry) return;
    this.bump(from);
    this.files.delete(from);
    if (this.layout.isRecordPath(to)) this.files.set(to, entry);
    this.changed();
  }

  private bump(path: string): number {
    const version = (this.versions.get(path) ?? 0) + 1;
    this.versions.set(path, version);
    return version;
  }

  private changed(): void {
    this.cache = null;
    for (const listener of [...this.listeners]) listener();
  }
}
