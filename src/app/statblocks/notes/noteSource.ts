/**
 * A statblock note's values as views read them (§8.2). Reading never writes.
 *
 * - **buffer**: a loaded `MarkdownView` holds the note, in any window. Its text
 *   (`getViewData()`, current in Reading view too) is the truth, so edits in Properties or
 *   Source mode show at once, where the metadata cache lags by Obsidian's save delay. Its
 *   frontmatter is parsed again only when the frontmatter block changed.
 * - **cache**: otherwise the metadata cache's frontmatter. The note's text, needed to tell a
 *   problem, is read once a view watches the note and taken from every cache change after.
 * - **none**: no such note.
 *
 * `read` gives the same snapshot object while nothing it reads changed, as React's
 * `useSyncExternalStore` needs. Watchers are told once per task in which the note changed,
 * not per frame: a main-window frame never comes while that window is hidden behind a popout
 * showing the pane.
 *
 * One per app, released when the plugin unloads.
 */

import type { App, EventRef, Events, MarkdownFileInfo, MarkdownView, TAbstractFile } from 'obsidian';
import { cacheFrontmatter, frontmatterBounds, readersAgree } from './frontmatterBounds';
import { frontmatterProblem } from './frontmatterProblem';
import { bufferViewOf } from './openEditors';
import { frontmatterOfText } from './statblockSource';

export interface NoteSnapshot {
  path: string;
  frontmatter: Readonly<Record<string, unknown>> | null;
  origin: 'buffer' | 'cache' | 'none';
  /** Why Atlas may not write the note's properties; its `line` is the note's, 1-based. */
  problem: { line: number | null; message: string } | null;
}

type Listener = (snapshot: NoteSnapshot) => void;

/** What a snapshot was read from: equal keys give the same snapshot. */
type ReadKey =
  | { origin: 'buffer'; block: string }
  | { origin: 'cache'; frontmatter: unknown; text: string | undefined }
  | { origin: 'none' };

interface NoteEntry {
  key: ReadKey | null;
  snapshot: NoteSnapshot | null;
  /** The note's text on disk, for its problem while no view holds it. */
  diskText: string | undefined;
  listeners: Set<Listener>;
  /** The snapshot watchers last heard of; set while the note is watched. */
  told: NoteSnapshot | null;
}

export class NoteSource {
  private static readonly instances = new WeakMap<App, NoteSource>();

  static forApp(app: App): NoteSource {
    let source = NoteSource.instances.get(app);
    if (!source) {
      source = new NoteSource(app);
      NoteSource.instances.set(app, source);
    }
    return source;
  }

  static release(app: App): void {
    NoteSource.instances.get(app)?.destroy();
    NoteSource.instances.delete(app);
  }

  private readonly entries = new Map<string, NoteEntry>();
  private readonly pending = new Set<string>();
  private readonly detachers: Array<() => void> = [];
  private scheduled = false;
  private destroyed = false;

  private constructor(private readonly app: App) {
    const { workspace, vault, metadataCache } = app;
    const track = (source: Events, ref: EventRef): void => { this.detachers.push(() => source.offref(ref)); };
    track(workspace, workspace.on('editor-change', (_editor, info: MarkdownView | MarkdownFileInfo) => this.changed(info.file?.path)));
    // A note opened, closed or switched between modes reads from elsewhere now.
    track(workspace, workspace.on('layout-change', () => { for (const path of this.entries.keys()) this.changed(path); }));
    track(vault, vault.on('modify', (file) => this.changed(file.path)));
    track(vault, vault.on('delete', (file) => this.changed(file.path)));
    track(vault, vault.on('rename', (file: TAbstractFile, oldPath: string) => { this.changed(oldPath); this.changed(file.path); }));
    track(metadataCache, metadataCache.on('changed', (file, data) => {
      const entry = this.entries.get(file.path);
      if (entry) entry.diskText = data;
      this.changed(file.path);
    }));
  }

  /** The note's values now. */
  read(path: string): NoteSnapshot {
    const entry = this.entry(path);
    const view = bufferViewOf(this.app, path);
    if (view) return this.fromBuffer(entry, path, view.getViewData());
    const file = this.app.vault.getFileByPath(path);
    if (!file) return this.keep(entry, { origin: 'none' }, () => ({ path, frontmatter: null, origin: 'none', problem: null }));
    const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter ?? null;
    const text = entry.diskText;
    return this.keep(entry, { origin: 'cache', frontmatter, text }, () => ({
      path,
      frontmatter,
      origin: 'cache',
      problem: text === undefined ? null : frontmatterProblem(text),
    }));
  }

  /** Calls `listener` with each new snapshot of the note; returns the unsubscribe. */
  watch(path: string, listener: Listener): () => void {
    const entry = this.entry(path);
    entry.listeners.add(listener);
    entry.told ??= this.read(path);
    if (entry.diskText === undefined) void this.readDisk(path, entry);
    return () => {
      entry.listeners.delete(listener);
      // An unwatched note keeps no text in memory; its next watcher reads it again.
      if (entry.listeners.size === 0 && this.entries.get(path) === entry) this.entries.delete(path);
    };
  }

  private fromBuffer(entry: NoteEntry, path: string, text: string): NoteSnapshot {
    const bounds = frontmatterBounds(text);
    const block = bounds.exists ? text.slice(0, bounds.contentStart) : '';
    // Where Obsidian's two readers disagree, the cache's reading decides the values too.
    const key = readersAgree(text, bounds) ? block : `\u0000${cacheFrontmatter(text) ?? ''}\u0000${block}`;
    return this.keep(entry, { origin: 'buffer', block: key }, () => ({
      path,
      frontmatter: frontmatterOfText(text),
      origin: 'buffer',
      problem: frontmatterProblem(text),
    }));
  }

  /** The entry's snapshot while what it was read from is unchanged, or while a new reading says the same. */
  private keep(entry: NoteEntry, key: ReadKey, make: () => NoteSnapshot): NoteSnapshot {
    if (entry.snapshot && entry.key && sameKey(entry.key, key)) return entry.snapshot;
    entry.key = key;
    const next = make();
    if (!entry.snapshot || !sameSnapshot(entry.snapshot, next)) entry.snapshot = next;
    return entry.snapshot;
  }

  private entry(path: string): NoteEntry {
    let entry = this.entries.get(path);
    if (!entry) {
      entry = { key: null, snapshot: null, diskText: undefined, listeners: new Set(), told: null };
      this.entries.set(path, entry);
    }
    return entry;
  }

  private async readDisk(path: string, entry: NoteEntry): Promise<void> {
    const file = this.app.vault.getFileByPath(path);
    if (!file) return;
    try {
      const text = await this.app.vault.cachedRead(file);
      // A cache change may have brought a newer text meanwhile.
      entry.diskText ??= text;
      this.changed(path);
    } catch (error) {
      console.error(`[Atlas] Reading ${path} failed:`, error);
    }
  }

  private changed(path: string | undefined): void {
    if (this.destroyed || path === undefined || !this.entries.get(path)?.listeners.size) return;
    this.pending.add(path);
    if (this.scheduled) return;
    this.scheduled = true;
    queueMicrotask(() => this.tell());
  }

  private tell(): void {
    this.scheduled = false;
    const paths = [...this.pending];
    this.pending.clear();
    for (const path of paths) {
      const entry = this.entries.get(path);
      if (this.destroyed || !entry || entry.listeners.size === 0) continue;
      const snapshot = this.read(path);
      if (snapshot === entry.told) continue;
      entry.told = snapshot;
      for (const listener of [...entry.listeners]) listener(snapshot);
    }
  }

  private destroy(): void {
    this.destroyed = true;
    for (const detach of this.detachers) detach();
    this.detachers.length = 0;
    this.entries.clear();
    this.pending.clear();
  }
}

function sameKey(a: ReadKey, b: ReadKey): boolean {
  switch (a.origin) {
    case 'buffer': return b.origin === 'buffer' && a.block === b.block;
    case 'cache': return b.origin === 'cache' && a.frontmatter === b.frontmatter && a.text === b.text;
    case 'none': return b.origin === 'none';
  }
}

function sameSnapshot(a: NoteSnapshot, b: NoteSnapshot): boolean {
  return a.path === b.path && a.origin === b.origin && a.frontmatter === b.frontmatter
    && a.problem?.line === b.problem?.line && a.problem?.message === b.problem?.message;
}
