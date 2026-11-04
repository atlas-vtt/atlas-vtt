import { TAbstractFile, TFile, type App, type EventRef, type Events } from 'obsidian';
import type { LibraryTemplate, TemplateLookup } from '../model/resolvedTypes';
import { isBuiltInTemplateId, type BuiltInTemplate, type TemplateId } from '../model/templateTypes';
import { workSlices } from '../../utils/workSlices';
import { allBuiltInTemplates } from './builtInTemplates';
import {
  TEMPLATE_EXTENSION,
  builtInEntry,
  indexTemplateFiles,
  isTemplatePath,
  isWithin,
  listTemplates,
  movedTemplateFile,
  readTemplateFile,
  type TemplateFile,
  type TemplateIndex,
} from './templateFiles';

/** What the library holds, as React reads it with `useSyncExternalStore`; a new object after every change. */
export interface TemplateLibrarySnapshot {
  /** Built-ins first, then the vault's templates by name; duplicates and unreadable files left out. */
  templates: readonly LibraryTemplate[];
  /** Every `.atlastemplate` file read, by path: unreadable, refused and duplicate ones too. */
  files: ReadonlyMap<string, TemplateFile>;
  /** Files whose id a file with a lower path holds: path → that file's path. */
  duplicates: ReadonlyMap<string, string>;
  /** True until the files present when the library started have been read. */
  loading: boolean;
}

export interface TemplateLibraryOptions {
  /** The templates built into Atlas; the registry's by default. */
  builtIns?: readonly BuiltInTemplate[];
}

const isTemplateFile = (file: unknown): file is TFile => file instanceof TFile && file.extension === TEMPLATE_EXTENSION;

/**
 * Every statblock template: the built-ins and each `.atlastemplate` file
 * anywhere in the vault (§4.3, §8.7). It reads files in slices, follows
 * creates, edits, deletes and renames, and never writes: a file that claims
 * another's id is reported as a duplicate, not given a new one. `get` answers
 * with the file's template as saved: what renders a statblock shows a
 * template's changes once the template editor saved them.
 *
 * One per app, shared by every view; released when the plugin unloads.
 */
export class TemplateLibrary implements TemplateLookup {
  private static readonly instances = new WeakMap<App, TemplateLibrary>();

  static forApp(app: App): TemplateLibrary {
    let library = TemplateLibrary.instances.get(app);
    if (!library) {
      library = new TemplateLibrary(app);
      TemplateLibrary.instances.set(app, library);
    }
    return library;
  }

  /** Stops following the vault and forgets the library; called when the plugin unloads. */
  static release(app: App): void {
    TemplateLibrary.instances.get(app)?.destroy();
    TemplateLibrary.instances.delete(app);
  }

  private readonly builtInList: readonly LibraryTemplate[];
  private readonly builtIns: ReadonlyMap<TemplateId, LibraryTemplate>;
  private readonly files = new Map<string, TemplateFile>();
  private index: TemplateIndex = indexTemplateFiles([]);
  private snapshot: TemplateLibrarySnapshot | null = null;
  private readonly queue = new Set<string>();
  /** Raised for a path whenever an event makes a read of it under way stale. */
  private readonly versions = new Map<string, number>();
  private readonly listeners = new Set<() => void>();
  private readonly detachers: Array<() => void> = [];
  private loading = true;
  private running = false;
  private dirty = false;
  private destroyed = false;

  constructor(private readonly app: App, options: TemplateLibraryOptions = {}) {
    this.builtInList = (options.builtIns ?? allBuiltInTemplates()).map(builtInEntry);
    this.builtIns = new Map(this.builtInList.map((entry) => [entry.template.id, entry]));
    // Before the layout is ready the vault reports every existing file as created.
    app.workspace.onLayoutReady(() => this.start());
  }

  /** The template with this id: a built-in, else the vault file that holds the id; null when there is none. */
  get(id: TemplateId): LibraryTemplate | null {
    if (isBuiltInTemplateId(id)) return this.builtIns.get(id) ?? null;
    return this.index.byId.get(id) ?? null;
  }

  /**
   * Text Atlas has just written to a template file, taken in without waiting
   * for the vault's event. A read under way is dropped and the file is read
   * once more, so a write by someone else right after is not missed.
   */
  recordWrite(path: string, text: string): void {
    if (this.destroyed || !isTemplatePath(path)) return;
    this.enqueue(path);
    // A read may have taken the text in already, without committing it yet.
    if (this.files.get(path)?.text !== text) this.files.set(path, readTemplateFile(path, text));
    else if (!this.dirty) return;
    this.commit();
  }

  list(): readonly LibraryTemplate[] {
    return this.getSnapshot().templates;
  }

  /** A template file as read, with its status and problems; null for a path the library holds no file at. */
  fileAt(path: string): TemplateFile | null {
    return this.files.get(path) ?? null;
  }

  /** The path of the file that holds this file's id, when this one is a duplicate. */
  duplicateOf(path: string): string | null {
    return this.index.duplicates.get(path) ?? null;
  }

  isLoading(): boolean {
    return this.loading;
  }

  /** Calls `listener` after every change; returns the unsubscribe. */
  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  readonly getSnapshot = (): TemplateLibrarySnapshot => {
    this.snapshot ??= {
      templates: listTemplates(this.builtInList, this.index),
      files: new Map(this.files),
      duplicates: this.index.duplicates,
      loading: this.loading,
    };
    return this.snapshot;
  };

  destroy(): void {
    this.destroyed = true;
    for (const detach of this.detachers) detach();
    this.detachers.length = 0;
    this.listeners.clear();
    this.queue.clear();
  }

  private start(): void {
    if (this.destroyed) return;
    const { vault } = this.app;
    this.listen(vault, 'create', (file) => this.written(file));
    this.listen(vault, 'modify', (file) => this.written(file));
    this.listen(vault, 'delete', (file) => this.deleted(file));
    this.listen(vault, 'rename', (file, oldPath) => this.renamed(file, oldPath));
    for (const file of vault.getFiles()) if (isTemplateFile(file)) this.queue.add(file.path);
    void this.drain();
  }

  private listen(source: Events, name: string, callback: (...data: unknown[]) => unknown): void {
    const ref: EventRef = source.on(name, callback);
    this.detachers.push(() => source.offref(ref));
  }

  private written(file: unknown): void {
    if (isTemplateFile(file)) this.enqueue(file.path);
  }

  private deleted(file: unknown): void {
    if (file instanceof TAbstractFile && this.forget(file.path)) this.commit();
  }

  /** A renamed file, or every template inside a renamed folder, moves without being read again. */
  private renamed(file: unknown, oldPath: unknown): void {
    if (!(file instanceof TAbstractFile) || typeof oldPath !== 'string') return;
    const moved = [...this.files.values()].filter((entry) => isWithin(entry.path, oldPath));
    let changed = this.forget(oldPath);
    for (const entry of moved) {
      const path = file.path + entry.path.slice(oldPath.length);
      this.bump(path);
      if (!isTemplatePath(path)) continue;
      this.files.set(path, movedTemplateFile(entry, path));
      changed = true;
    }
    // Templates not read yet (or a file renamed to the extension) are read at their new place.
    const candidates = file instanceof TFile ? [file] : this.app.vault.getFiles().filter((child: TFile) => isWithin(child.path, file.path));
    for (const candidate of candidates) if (isTemplateFile(candidate) && !this.files.has(candidate.path)) this.enqueue(candidate.path);
    if (changed) this.commit();
  }

  /** Drops what the library holds or plans to read at a path or below it; true when a file was dropped. */
  private forget(path: string): boolean {
    for (const known of this.versions.keys()) if (isWithin(known, path)) this.bump(known);
    for (const queued of [...this.queue]) if (isWithin(queued, path)) this.queue.delete(queued);
    let changed = false;
    for (const known of [...this.files.keys()]) {
      if (!isWithin(known, path)) continue;
      this.files.delete(known);
      changed = true;
    }
    return changed;
  }

  private bump(path: string): number {
    const version = (this.versions.get(path) ?? 0) + 1;
    this.versions.set(path, version);
    return version;
  }

  private enqueue(path: string): void {
    if (this.destroyed) return;
    this.bump(path);
    this.queue.add(path);
    void this.drain();
  }

  private async drain(): Promise<void> {
    if (this.running || this.destroyed) return;
    this.running = true;
    const pause = workSlices();
    try {
      for (let path = this.next(); path !== null; path = this.next()) {
        await this.read(path);
        // Released during the read: no turn is asked for, and `next` hands out nothing more.
        if (!this.destroyed) await pause();
      }
    } finally {
      this.running = false;
      if (!this.destroyed && (this.dirty || this.loading)) {
        this.loading = false;
        this.commit();
      }
    }
  }

  private next(): string | null {
    if (this.destroyed) return null;
    const [path] = this.queue;
    if (path === undefined) return null;
    this.queue.delete(path);
    return path;
  }

  private async read(path: string): Promise<void> {
    const version = this.bump(path);
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!isTemplateFile(file)) {
      if (this.files.delete(path)) this.dirty = true;
      return;
    }
    let text: string;
    try {
      text = await this.app.vault.cachedRead(file);
    } catch (error) {
      console.error(`[TemplateLibrary] Could not read ${path}:`, error);
      return;
    }
    if (this.destroyed || this.versions.get(path) !== version || this.files.get(path)?.text === text) return;
    this.files.set(path, readTemplateFile(path, text));
    this.dirty = true;
  }

  private commit(): void {
    this.dirty = false;
    this.index = indexTemplateFiles(this.files.values());
    this.publish();
  }

  private publish(): void {
    this.snapshot = null;
    for (const listener of [...this.listeners]) listener();
  }
}
