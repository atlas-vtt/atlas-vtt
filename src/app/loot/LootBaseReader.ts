import { TFile, type App } from 'obsidian';
import { baseViewNames, lootQueryConfig } from './lootBaseQuery';
import { toLootItems, type LootItem } from './lootItem';
import { LootBaseQuery, lootBasesAvailable } from './lootQueryView';
import { parseNoteYaml } from '../services/noteYaml';

/**
 * Where a view's items stand: `loading` until Obsidian first ran its query,
 * `unavailable` when Obsidian cannot run it (Bases is off), `unreadable` when it ran
 * the query and Atlas could not read what came of it.
 */
export type LootViewStatus = 'loading' | 'ready' | 'unavailable' | 'unreadable';

/** One view of a loot base and the items it currently holds. */
export interface LootBaseView {
  /** `<base path>#<view name>`, what the loot roller stores to switch it off. */
  id: string;
  name: string;
  items: LootItem[];
  status: LootViewStatus;
}

/** A `.base` file picked as a loot source. */
export interface LootBase {
  path: string;
  name: string;
  views: LootBaseView[];
  /** The file was not found; a base that cannot be read has no views. */
  missing: boolean;
  /** The file is there and could not be read, or what it holds is no YAML; such a base has no views. */
  unreadable?: true;
}

export function lootViewId(basePath: string, viewName: string): string {
  return `${basePath}#${viewName}`;
}

/** Whether every view of the base has been read, or cannot be. */
export function isLootBaseLoaded(base: LootBase): boolean {
  return base.views.every((view) => view.status !== 'loading');
}

/** Items in any of the base's views, each once. */
export function lootBaseItemCount(base: LootBase): number {
  return new Set(base.views.flatMap((view) => view.items.map((item) => item.id))).size;
}

/** Whether Obsidian could not run some view of the base, because Bases is off. */
export function needsBases(base: LootBase): boolean {
  return base.views.some((view) => view.status === 'unavailable');
}

/** Whether the base's file, or the results of some view of it, could not be read. */
export function isLootBaseUnreadable(base: LootBase): boolean {
  return base.unreadable === true || base.views.some((view) => view.status === 'unreadable');
}

function sameItems(a: readonly LootItem[], b: readonly LootItem[]): boolean {
  return a.length === b.length && JSON.stringify(a) === JSON.stringify(b);
}

/** The parsed base file, or null when it is no valid YAML. */
export function readBase(text: string, path: string): unknown {
  try {
    return parseNoteYaml(text);
  } catch (error) {
    console.warn(`[Atlas] Could not read the base ${path}:`, error);
    return null;
  }
}

/**
 * Keeps the items of every view of one base: runs each view through Obsidian
 * and reports the base whenever a view's results change. `load` again after
 * the base file itself changed. Every `load` ends with the base reported: as
 * read, as not in the vault, or as one that could not be read.
 */
export class LootBaseReader {
  private queries: LootBaseQuery[] = [];
  private run = 0;
  private base: LootBase;

  constructor(
    private readonly app: App,
    private readonly path: string,
    private readonly onChange: (base: LootBase) => void,
  ) {
    this.base = { path, name: path, views: [], missing: false };
  }

  async load(): Promise<void> {
    this.stop();
    const run = this.run;
    const file = this.app.vault.getAbstractFileByPath(this.path);
    if (!(file instanceof TFile)) {
      this.publish({ path: this.path, name: this.base.name, views: [], missing: true });
      return;
    }
    let base: unknown;
    try {
      base = parseNoteYaml(await this.app.vault.cachedRead(file));
    } catch (error) {
      if (run === this.run) this.failed(file.basename, error);
      return;
    }
    if (run !== this.run) return;

    const names = baseViewNames(base);
    const status: LootViewStatus = lootBasesAvailable() ? 'loading' : 'unavailable';
    this.publish({
      path: this.path,
      name: file.basename,
      views: names.map((name) => ({ id: lootViewId(this.path, name), name, items: [], status })),
      missing: false,
    });
    if (status === 'unavailable') return;

    const update = (name: string, change: Partial<LootBaseView>): void => {
      if (run !== this.run) return;
      this.publish({
        ...this.base,
        views: this.base.views.map((view) => (view.name === name ? { ...view, ...change } : view)),
      });
    };
    // A view that cannot be read stops loading: the base's other views are rolled on without it
    const unreadable = (name: string, error: unknown): void => {
      // Obsidian runs the query again for every change in the vault: said once, until the view reads
      if (run !== this.run || this.base.views.find((view) => view.name === name)?.status === 'unreadable') return;
      console.warn(`[Atlas] Could not read the view ${name} of ${this.path}:`, error);
      update(name, { items: [], status: 'unreadable' });
    };
    const started = names.flatMap((name) => {
      const config = lootQueryConfig(base, name);
      if (!config) return [];
      const query = new LootBaseQuery(this.app, config, this.path, {
        onSnapshot: (snapshot) => {
          let items: LootItem[];
          try {
            items = toLootItems(snapshot, [file.basename, name]);
          } catch (error) {
            unreadable(name, error);
            return;
          }
          const current = this.base.views.find((view) => view.name === name);
          // Obsidian also runs the query again for vault changes that leave the view as it was.
          if (current?.status === 'ready' && sameItems(current.items, items)) return;
          update(name, { items, status: 'ready' });
        },
        onUnavailable: () => update(name, { status: 'unavailable' }),
        onUnreadable: (error) => unreadable(name, error),
      });
      return [{ name, query }];
    });
    this.queries = started.map(({ query }) => query);
    await Promise.all(started.map(({ name, query }) => query.start().catch((error: unknown) => unreadable(name, error))));
  }

  stop(): void {
    this.run++;
    for (const query of this.queries) query.stop();
    this.queries = [];
  }

  /** The file could not be read or is no YAML: the base stops loading, and is read anew when `load` is called for a change of its file. */
  private failed(name: string, error: unknown): void {
    // Deleted or moved while it was read: the base is gone, not unreadable.
    if (!(this.app.vault.getAbstractFileByPath(this.path) instanceof TFile)) {
      this.publish({ path: this.path, name, views: [], missing: true });
      return;
    }
    console.warn(`[Atlas] Could not read the base ${this.path}:`, error);
    this.publish({ path: this.path, name, views: [], missing: false, unreadable: true });
  }

  private publish(base: LootBase): void {
    this.base = base;
    this.onChange(base);
  }
}
