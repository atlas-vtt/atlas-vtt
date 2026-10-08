import { TFile, type App } from 'obsidian';
import { baseViewNames, lootQueryConfig } from './lootBaseQuery';
import { toLootItems, type LootItem } from './lootItem';
import { LootBaseQuery, lootBasesAvailable } from './lootQueryView';
import { parseNoteYaml } from '../services/noteYaml';

/**
 * Where a view's items stand: `loading` until Obsidian first ran its query,
 * `unavailable` when Obsidian cannot run it (Bases is off).
 */
export type LootViewStatus = 'loading' | 'ready' | 'unavailable';

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
 * the base file itself changed.
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
    const base = readBase(await this.app.vault.cachedRead(file), this.path);
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
    this.queries = names.flatMap((name) => {
      const config = lootQueryConfig(base, name);
      if (!config) return [];
      return [new LootBaseQuery(this.app, config, this.path, {
        onSnapshot: (snapshot) => {
          const items = toLootItems(snapshot, [file.basename, name]);
          const current = this.base.views.find((view) => view.name === name);
          // Obsidian also runs the query again for vault changes that leave the view as it was.
          if (current?.status === 'ready' && sameItems(current.items, items)) return;
          update(name, { items, status: 'ready' });
        },
        onUnavailable: () => update(name, { status: 'unavailable' }),
      })];
    });
    await Promise.all(this.queries.map((query) => query.start()));
  }

  stop(): void {
    this.run++;
    for (const query of this.queries) query.stop();
    this.queries = [];
  }

  private publish(base: LootBase): void {
    this.base = base;
    this.onChange(base);
  }
}
