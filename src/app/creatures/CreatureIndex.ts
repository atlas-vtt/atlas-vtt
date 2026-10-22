import { TAbstractFile, type App, type EventRef, type Events } from 'obsidian';
import { TemplateLibrary } from '../statblocks/library/TemplateLibrary';
import { shownFieldsOf, type LibraryTemplate, type TemplateLookup } from '../statblocks/model/resolvedTypes';
import type { TemplateId } from '../statblocks/model/templateTypes';
import type { FieldMeanings } from '../statblocks/resolve/fieldMeanings';
import { resolveStatblock } from '../statblocks/resolve/resolveStatblock';
import { bestiaryLookup, type BestiaryLookup } from './linkedCreature';
import { workSlices } from '../utils/workSlices';

/** A linked statblock as filters read it. */
export interface IndexedCreature {
  /** Vault path of the statblock note. */
  path: string;
  /** Every field of the creature as `resolveStatblock` gives it: renamed keys of native notes under their current key too. */
  fields: Readonly<Record<string, unknown>>;
  /** The template a native statblock names; null for Fantasy Statblocks' statblocks. */
  templateId: TemplateId | null;
  /** Keys of the template's fields that carry a meaning; empty for Fantasy Statblocks' statblocks and the auto template. */
  meanings: FieldMeanings;
  /** Name of the template or Fantasy Statblocks layout the statblock renders with; null when none is known. */
  lookName: string | null;
}

/** The template a native note was read with. */
interface TemplateRead {
  id: TemplateId;
  template: LibraryTemplate | null;
}

/** Fantasy Statblocks events after which its bestiary may hold other creatures. */
const BESTIARY_EVENTS = [
  'fantasy-statblocks:loaded',
  'fantasy-statblocks:bestiary:resolved',
  'fantasy-statblocks:bestiary:updated',
] as const;

/** Notes read at the same time while resolving statblock fences. */
const CONCURRENCY = 4;
/** The bestiary fires one update per parsed note while it loads; rebuild once they settle. */
export const BESTIARY_SETTLE_MS = 150;

/**
 * The creatures of the statblock notes tokens link to, by note path. Resolves
 * the notes it is asked for and keeps them current: a note edit re-reads that
 * note, a bestiary update re-reads all of them, and a change, rename or
 * deletion of a template re-reads the native notes drawn with it. Old entries
 * stay readable until their replacement is ready, so filters never flash empty
 * while it works.
 *
 * One per app, shared by every view; released when the plugin unloads.
 */
export class CreatureIndex {
  private static readonly instances = new WeakMap<App, CreatureIndex>();

  static forApp(app: App): CreatureIndex {
    let index = CreatureIndex.instances.get(app);
    if (!index) {
      index = new CreatureIndex(app);
      CreatureIndex.instances.set(app, index);
    }
    return index;
  }

  /** Stops listening to the vault and forgets the index; called when the plugin unloads. */
  static release(app: App): void {
    CreatureIndex.instances.get(app)?.destroy();
    CreatureIndex.instances.delete(app);
  }

  /** Resolved notes; null for a note that defines no statblock. */
  private readonly entries = new Map<string, IndexedCreature | null>();
  /** Every note asked for, re-resolved when the bestiary changes. */
  private readonly wanted = new Set<string>();
  private readonly queue = new Set<string>();
  private readonly listeners = new Set<() => void>();
  private readonly detachers: Array<() => void> = [];
  /** The template each native note was read with, by note path. */
  private readonly templateReads = new Map<string, TemplateRead>();
  /** Taken from the app only once a native note is read, so vaults without one never load templates. */
  private library: TemplateLibrary | null = null;
  private bestiary: BestiaryLookup | null = null;
  private running = false;
  private destroyed = false;
  private revision = 0;
  private settleTimer: number | null = null;

  private constructor(private readonly app: App) {
    for (const event of BESTIARY_EVENTS) this.listen(app.workspace, event, () => this.bestiaryChanged());
    this.listen(app.metadataCache, 'changed', (file: unknown) => this.fileChanged(file));
    this.listen(app.vault, 'rename', (_file: unknown, oldPath: unknown) => {
      if (typeof oldPath === 'string') this.invalidate(oldPath);
    });
    this.listen(app.vault, 'delete', (file: unknown) => this.fileChanged(file));
  }

  /** The creature of a note: undefined while it has not been resolved, null when it defines no statblock. */
  get(path: string): IndexedCreature | null | undefined {
    return this.entries.get(path);
  }

  /** Whether notes are being resolved. */
  isPending(): boolean {
    return this.running || this.queue.size > 0;
  }

  /** Changes whenever an entry or the pending state changes. */
  readonly getRevision = (): number => this.revision;

  /** Calls `listener` after every change; returns the unsubscribe. */
  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  /** Resolves the notes among `paths` that are not indexed yet. */
  request(paths: Iterable<string>): void {
    let added = false;
    for (const path of paths) {
      if (this.wanted.has(path)) continue;
      this.wanted.add(path);
      this.queue.add(path);
      added = true;
    }
    if (added) this.startDraining();
  }

  destroy(): void {
    this.destroyed = true;
    for (const detach of this.detachers) detach();
    this.detachers.length = 0;
    if (this.settleTimer !== null) window.clearTimeout(this.settleTimer);
    this.listeners.clear();
    this.queue.clear();
  }

  /** The app's template library, followed from the first time a note asks for a template. */
  private templateLibrary(): TemplateLibrary {
    if (!this.library) {
      const library = TemplateLibrary.forApp(this.app);
      this.detachers.push(library.subscribe(() => this.templatesChanged()));
      this.library = library;
    }
    return this.library;
  }

  /** Reads again every native note whose template is no longer the one it was read with. */
  private templatesChanged(): void {
    const library = this.library;
    if (!library) return;
    for (const [path, read] of this.templateReads) {
      if (library.get(read.id) !== read.template) this.invalidate(path);
    }
  }

  private listen(source: Events, name: string, callback: (...data: unknown[]) => unknown): void {
    const ref: EventRef = source.on(name, callback);
    this.detachers.push(() => source.offref(ref));
  }

  private bestiaryChanged(): void {
    if (this.settleTimer !== null) window.clearTimeout(this.settleTimer);
    this.settleTimer = window.setTimeout(() => {
      this.settleTimer = null;
      this.bestiary = null;
      for (const path of this.wanted) this.queue.add(path);
      this.startDraining();
    }, BESTIARY_SETTLE_MS);
  }

  private fileChanged(file: unknown): void {
    if (file instanceof TAbstractFile) this.invalidate(file.path);
  }

  private invalidate(path: string): void {
    if (!this.wanted.has(path)) return;
    this.queue.add(path);
    this.startDraining();
  }

  private startDraining(): void {
    if (this.running || this.destroyed) return;
    this.running = true;
    this.changed();
    void this.drain();
  }

  private async drain(): Promise<void> {
    try {
      while (this.queue.size > 0 && !this.destroyed) {
        const paths = [...this.queue];
        this.queue.clear();
        const bestiary = this.bestiary ??= bestiaryLookup();
        const resolved = await this.resolveAll(paths, bestiary);
        if (this.destroyed) return;
        for (const [path, creature] of resolved) this.entries.set(path, creature);
      }
    } finally {
      this.running = false;
      if (!this.destroyed) this.changed();
    }
  }

  private async resolveAll(paths: readonly string[], bestiary: BestiaryLookup): Promise<Map<string, IndexedCreature | null>> {
    const resolved = new Map<string, IndexedCreature | null>();
    let next = 0;
    // Most notes resolve from the bestiary without a read, so a library of thousands is paced.
    const pause = workSlices();
    const worker = async (): Promise<void> => {
      for (let path = paths[next++]; path !== undefined; path = paths[next++]) {
        resolved.set(path, await this.resolve(path, bestiary));
        await pause();
        if (this.destroyed) return;
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, paths.length) }, worker));
    return resolved;
  }

  private async resolve(path: string, bestiary: BestiaryLookup): Promise<IndexedCreature | null> {
    this.templateReads.delete(path);
    const templates: TemplateLookup = {
      get: (id) => {
        if (this.destroyed) return null;
        const template = this.templateLibrary().get(id);
        this.templateReads.set(path, { id, template });
        return template;
      },
    };
    try {
      const resolved = await resolveStatblock(this.app, path, { templates, bestiary });
      if (!resolved) return null;
      const { meanings, lookName, source } = resolved;
      // Filters, ratings and token defaults read numbers as the card shows them
      return { path, fields: shownFieldsOf(resolved), templateId: source.kind === 'atlas' ? source.templateId : null, meanings, lookName };
    } catch (error) {
      console.error(`[CreatureIndex] Could not read the statblock in ${path}:`, error);
      return null;
    }
  }

  private changed(): void {
    this.revision++;
    for (const listener of [...this.listeners]) listener();
  }
}
