import { TFile, type App, type CachedMetadata, type EventRef } from 'obsidian';
import type { LootItem } from '../loot/lootItem';
import type { RandomTableSource } from '../types/randomTableTypes';
import { LinkedBaseViews } from './LinkedBaseViews';
import { nameLink, tableRowItem, type LinkedItemNote } from './linkedItems';
import { tablesOfNote } from './noteTables';
import type { LinkedTable, TableResolver } from './resultCells';
import { findNoteTables, linkedTable, splitLink, tableSourceId, type NoteState, type TableStatus } from './tableLookup';
import type { RandomTable } from './tableModel';

/** A table the collection names, as its note holds it now. */
export interface CollectionTable {
  /** `<note path>#<index>`, as listed in the settings. */
  id: string;
  source: RandomTableSource;
  status: TableStatus;
  table: RandomTable | null;
  /** The note's name, the first part of where a result comes from. */
  noteName: string;
  /** For an Items table, the item of each row, in row order. */
  items?: LootItem[];
}

/** Edits of a note arrive keystroke by keystroke; one read follows a pause. */
const READ_DELAY_MS = 300;

const noteNameOf = (path: string): string => path.slice(path.lastIndexOf('/') + 1).replace(/\.md$/i, '');

/**
 * Keeps the tables a collection names in its notes: reads each note once, again after it
 * changes, moves or goes, and reports every table with how it was found. Items tables read
 * the notes their rows link to through the metadata cache and follow those too. Also finds
 * what a link in a result names (`resolver`): a table in any note, or a Base view, whose
 * Base it then follows, for rolling linked tables in place (master tables).
 */
export class TableNoteReader {
  private sources: readonly RandomTableSource[] = [];
  private readonly notes = new Map<string, NoteState>();
  private readonly timers = new Map<string, number>();
  /** Item notes linked from rows, followed while their table is listed. */
  private linkedNotes = new Set<string>();
  private readonly refs: EventRef[] = [];
  private readonly baseViews: LinkedBaseViews;
  private run = 0;

  constructor(
    private readonly app: App,
    private readonly onChange: (tables: readonly CollectionTable[]) => void,
    private readonly delayMs = READ_DELAY_MS,
  ) {
    this.baseViews = new LinkedBaseViews(app);
    const vault = app.vault;
    this.refs.push(
      vault.on('modify', (file) => this.noteChanged(file.path)),
      vault.on('create', (file) => this.noteChanged(file.path)),
      vault.on('delete', (file) => this.noteChanged(file.path)),
      vault.on('rename', (file, oldPath) => {
        this.noteChanged(oldPath);
        this.noteChanged(file.path);
      }),
      app.metadataCache.on('changed', (file) => {
        if (this.linkedNotes.has(file.path)) this.publish();
      }),
    );
  }

  /** The tables to keep; notes no longer named are let go, new ones read. */
  setSources(sources: readonly RandomTableSource[]): void {
    this.sources = sources;
    const paths = new Set(sources.map((source) => source.path));
    for (const path of [...this.notes.keys()]) if (!paths.has(path)) this.notes.delete(path);
    for (const path of paths) {
      if (!this.notes.has(path)) {
        this.notes.set(path, { kind: 'loading' });
        void this.read(path);
      }
    }
    this.publish();
  }

  stop(): void {
    this.run++;
    for (const timer of this.timers.values()) window.clearTimeout(timer);
    this.timers.clear();
    for (const ref of this.refs) {
      this.app.vault.offref(ref);
      this.app.metadataCache.offref(ref);
    }
    this.refs.length = 0;
    this.baseViews.stop();
  }

  /** Finds linked tables in any note of the vault, read when asked. */
  readonly resolver: TableResolver = {
    resolve: async (link, fromPath) => this.resolveLink(link, fromPath),
  };

  private noteChanged(path: string): void {
    if (this.baseViews.follows(path)) this.baseViews.reload(path);
    if (!this.notes.has(path)) return;
    window.clearTimeout(this.timers.get(path));
    this.timers.set(path, window.setTimeout(() => {
      this.timers.delete(path);
      void this.read(path);
    }, this.delayMs));
  }

  private async readNote(path: string): Promise<NoteState> {
    const file = this.app.vault.getFileByPath(path);
    if (!file) return { kind: 'missing' };
    return { kind: 'read', tables: tablesOfNote(await this.app.vault.cachedRead(file), file.basename) };
  }

  private async read(path: string): Promise<void> {
    const run = this.run;
    try {
      const state = await this.readNote(path);
      if (run !== this.run || !this.notes.has(path)) return;
      this.notes.set(path, state);
    } catch (error) {
      console.error(`[Atlas] Could not read the table note ${path}:`, error);
      if (run !== this.run || !this.notes.has(path)) return;
      this.notes.set(path, { kind: 'missing' });
    }
    this.publish();
  }

  private linkedNote(link: string, fromPath: string): LinkedItemNote | null {
    const file = this.app.metadataCache.getFirstLinkpathDest(link, fromPath);
    if (!(file instanceof TFile) || file.extension !== 'md') return null;
    this.linkedNotes.add(file.path);
    const cache: CachedMetadata | null = this.app.metadataCache.getFileCache(file);
    return { path: file.path, name: file.basename, frontmatter: cache?.frontmatter ?? {} };
  }

  private itemsOf(table: RandomTable, source: RandomTableSource): LootItem[] {
    const from = [noteNameOf(source.path), source.label ?? table.name] as const;
    return table.rows.map((row) => {
      const link = nameLink(row.cells[0] ?? '');
      return tableRowItem(table, row, source.path, from, link ? this.linkedNote(link.link, source.path) : null);
    });
  }

  private publish(): void {
    this.linkedNotes = new Set();
    const byNote = new Map<string, RandomTableSource[]>();
    for (const source of this.sources) byNote.set(source.path, [...(byNote.get(source.path) ?? []), source]);
    const found = new Map<RandomTableSource, ReturnType<typeof findNoteTables>[number]>();
    for (const [path, sources] of byNote) {
      findNoteTables(sources, this.notes.get(path) ?? { kind: 'loading' }).forEach((table, i) => found.set(sources[i]!, table));
    }
    this.onChange(this.sources.map((source) => {
      const { status, table } = found.get(source) ?? { status: 'loading', table: null };
      return {
        id: tableSourceId(source),
        source,
        status,
        table,
        noteName: noteNameOf(source.path),
        ...(table && source.kind === 'items' && { items: this.itemsOf(table, source) }),
      };
    }));
  }

  private async resolveLink(link: string, fromPath: string): Promise<LinkedTable | null> {
    const parts = splitLink(link);
    if (!parts) return null;
    const file = parts.note ? this.app.metadataCache.getFirstLinkpathDest(parts.note, fromPath) : this.app.vault.getFileByPath(fromPath);
    if (!(file instanceof TFile)) return null;
    if (file.extension === 'base') {
      const items = await this.baseViews.items(file.path, parts.heading);
      return items ? { kind: 'view', key: `${file.path}#${parts.heading ?? ''}`, items } : null;
    }
    if (file.extension !== 'md') return null;
    const known = this.notes.get(file.path);
    const state = known?.kind === 'read' ? known : await this.readNote(file.path);
    const table = state.kind === 'read' ? linkedTable(state.tables, parts.heading) : null;
    if (!table) return null;
    // A table the collection rolls as Items gives the item of the row that comes up.
    const listed = this.sources.find((source) => source.path === file.path && source.kind === 'items'
      && findNoteTables([source], state)[0]?.table === table);
    return {
      kind: 'table',
      key: tableSourceId({ path: file.path, index: table.index }),
      table,
      notePath: file.path,
      ...(listed && { items: this.itemsOf(table, listed) }),
    };
  }
}
