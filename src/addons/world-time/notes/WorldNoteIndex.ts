import { TFile, type App, type EventRef, type Events } from 'obsidian';
import type { NoteDates } from '../dating/effectiveDates';
import { readWorldNote, type MapVariantNote, type WorldEra, type WorldEvent, type WorldNoteRecord } from './worldNoteRecord';

/** A burst of vault changes (a sync, a folder move) is re-read once it settles. */
const RESCAN_DELAY_MS = 400;

/**
 * The world data of every note in the vault: dates for inheritance, events,
 * eras, map-variant notes and the place hierarchy. Kept current from
 * Obsidian's metadata cache. One per app, shared by every view; released when
 * the plugin unloads.
 */
export class WorldNoteIndex {
  private static readonly instances = new WeakMap<App, WorldNoteIndex>();

  static forApp(app: App): WorldNoteIndex {
    let index = WorldNoteIndex.instances.get(app);
    if (!index) {
      index = new WorldNoteIndex(app);
      WorldNoteIndex.instances.set(app, index);
    }
    return index;
  }

  static release(app: App): void {
    WorldNoteIndex.instances.get(app)?.destroy();
    WorldNoteIndex.instances.delete(app);
  }

  private readonly records = new Map<string, WorldNoteRecord>();
  private readonly listeners = new Set<() => void>();
  private readonly detachers: Array<() => void> = [];
  private revision = 0;
  private rescanTimer: number | null = null;
  private notifyQueued = false;

  private constructor(private readonly app: App) {
    this.listen(app.metadataCache, 'changed', (file: unknown) => {
      if (file instanceof TFile) this.readFile(file, true);
    });
    // Links in frontmatter resolve differently once notes appear, move or vanish.
    this.listen(app.vault, 'create', () => this.scheduleRescan());
    this.listen(app.vault, 'rename', () => this.scheduleRescan());
    this.listen(app.vault, 'delete', (file: unknown) => {
      if (file instanceof TFile && this.records.delete(file.path)) this.changed();
      this.scheduleRescan();
    });
    this.listen(app.metadataCache, 'resolved', () => {
      if (this.records.size === 0) this.rescan();
    });
    this.rescan();
  }

  readonly getRevision = (): number => this.revision;

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  noteDates(path: string): NoteDates | undefined {
    return this.records.get(path)?.dates;
  }

  record(path: string): WorldNoteRecord | undefined {
    return this.records.get(path);
  }

  /** The `parent` of a place note, as a vault path. */
  parentOf(path: string): string | undefined {
    return this.records.get(path)?.parent;
  }

  events(): WorldEvent[] {
    const events: WorldEvent[] = [];
    for (const record of this.records.values()) if (record.event) events.push(record.event);
    return events;
  }

  eras(): WorldEra[] {
    const eras: WorldEra[] = [];
    for (const record of this.records.values()) if (record.era) eras.push(record.era);
    return eras;
  }

  /** `type: map-variant` notes that name `scenePath` as their scene. */
  mapVariantsFor(scenePath: string): MapVariantNote[] {
    const variants: MapVariantNote[] = [];
    for (const record of this.records.values()) {
      if (record.mapVariant?.scene === scenePath) variants.push(record.mapVariant);
    }
    return variants;
  }

  destroy(): void {
    for (const detach of this.detachers) detach();
    this.detachers.length = 0;
    if (this.rescanTimer !== null) window.clearTimeout(this.rescanTimer);
    this.rescanTimer = null;
    this.listeners.clear();
    this.records.clear();
  }

  private listen(source: Events, name: string, callback: (...data: unknown[]) => unknown): void {
    const ref: EventRef = source.on(name, callback);
    this.detachers.push(() => source.offref(ref));
  }

  private readonly resolveLink = (linkText: string, sourcePath: string): string | undefined =>
    this.app.metadataCache.getFirstLinkpathDest(linkText, sourcePath)?.path;

  private readFile(file: TFile, notify: boolean): void {
    if (file.extension !== 'md') return;
    const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
    const record = readWorldNote(file.path, frontmatter, this.resolveLink);
    const had = this.records.has(file.path);
    if (record) this.records.set(file.path, record);
    else this.records.delete(file.path);
    if (notify && (record || had)) this.changed();
  }

  private scheduleRescan(): void {
    if (this.rescanTimer !== null) window.clearTimeout(this.rescanTimer);
    this.rescanTimer = window.setTimeout(() => {
      this.rescanTimer = null;
      this.rescan();
    }, RESCAN_DELAY_MS);
  }

  private rescan(): void {
    this.records.clear();
    for (const file of this.app.vault.getMarkdownFiles()) this.readFile(file, false);
    this.changed();
  }

  /** Listeners hear one notification per task, however many notes changed in it. */
  private changed(): void {
    this.revision++;
    if (this.notifyQueued) return;
    this.notifyQueued = true;
    queueMicrotask(() => {
      this.notifyQueued = false;
      for (const listener of this.listeners) listener();
    });
  }
}
