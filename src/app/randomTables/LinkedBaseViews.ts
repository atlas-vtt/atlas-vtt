import type { App } from 'obsidian';
import { isLootBaseLoaded, LootBaseReader, type LootBase } from '../loot/LootBaseReader';
import type { LootItem } from '../loot/lootItem';

/** How long a roll waits for Obsidian to run a Base's views the first time. */
const FIRST_READ_MS = 5000;

interface Followed {
  reader: LootBaseReader;
  base: LootBase | null;
  /** Settles once every view has been read, or cannot be. */
  ready: Promise<void>;
}

/**
 * The items of the Base views table cells link to (`[[Loot.base#Rare]]`): each Base read
 * through Obsidian once it is first linked, then kept current, as the loot roller keeps its
 * bases, until `stop`.
 */
export class LinkedBaseViews {
  private readonly bases = new Map<string, Followed>();

  constructor(private readonly app: App) {}

  /** Whether the Base at `path` is followed, so a change of its file reads it again. */
  follows(path: string): boolean {
    return this.bases.has(path);
  }

  reload(path: string): void {
    this.bases.get(path)?.reader.load().catch((error: unknown) => {
      console.error(`[Atlas] Could not read the base ${path}:`, error);
    });
  }

  /**
   * The items of the view `viewName` of the Base at `path`, or of all its views (each once)
   * without a view named; null when the Base or the view is gone or Obsidian cannot run it.
   */
  async items(path: string, viewName: string | undefined): Promise<LootItem[] | null> {
    const followed = this.follow(path);
    let timer = 0;
    await Promise.race([followed.ready, new Promise<void>((resolve) => { timer = window.setTimeout(resolve, FIRST_READ_MS); })]);
    window.clearTimeout(timer);
    const base = followed.base;
    if (!base || base.missing) return null;
    const views = viewName === undefined ? base.views : base.views.filter((view) => view.name === viewName.trim());
    if (views.length === 0 || views.some((view) => view.status !== 'ready')) return null;
    return views.flatMap((view) => view.items);
  }

  stop(): void {
    for (const followed of this.bases.values()) followed.reader.stop();
    this.bases.clear();
  }

  private follow(path: string): Followed {
    const known = this.bases.get(path);
    if (known) return known;
    let settle = (): void => undefined;
    const ready = new Promise<void>((resolve) => { settle = resolve; });
    const followed: Followed = {
      reader: new LootBaseReader(this.app, path, (base) => {
        followed.base = base;
        if (isLootBaseLoaded(base)) settle();
      }),
      base: null,
      ready,
    };
    this.bases.set(path, followed);
    this.reload(path);
    return followed;
  }
}
