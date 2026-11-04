import type { AssetService } from './AssetService';
import { sameWidgets, type WidgetRecord } from '../utils/collectionWidgets';

/** Counters change on every click, so writes wait for a pause. */
const SAVE_DELAY_MS = 1000;

/** Shared fallback, so a collection without widgets always reads as the same record. */
const NO_WIDGETS: WidgetRecord = {};

/**
 * Reads and writes the collection-wide widgets kept in each collection's settings.
 * Edits are held in memory until the debounced write has finished, so scenes loaded
 * in the meantime already see them.
 */
export class CollectionWidgetStore {
  /** Latest widgets per collection that are not yet written to the asset index. */
  private readonly unsaved = new Map<string, WidgetRecord>();
  /** Collections whose write has not started yet. */
  private readonly scheduled = new Set<string>();
  private saveTimer: number | undefined;
  private readonly listeners = new Set<() => void>();

  constructor(private readonly assets: AssetService) {}

  /** The collection a scene belongs to, or null for scenes outside any collection. */
  collectionFor(mapPath: string): string | null {
    return this.assets.getCollectionForMap(mapPath);
  }

  get(collectionId: string): WidgetRecord {
    return this.unsaved.get(collectionId) ?? this.assets.getCollectionSettings(collectionId).widgets ?? NO_WIDGETS;
  }

  /** Calls `listener` whenever a collection's widgets change; returns the unsubscribe. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  /** Records the collection's widgets and schedules the write; unchanged widgets write nothing. */
  set(collectionId: string, widgets: WidgetRecord): void {
    if (sameWidgets(this.get(collectionId), widgets)) return;
    this.unsaved.set(collectionId, widgets);
    this.listeners.forEach((listener) => listener());
    this.scheduled.add(collectionId);
    window.clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => this.flush(), SAVE_DELAY_MS);
  }

  /** Starts writing every pending change now. */
  flush(): void {
    window.clearTimeout(this.saveTimer);
    this.saveTimer = undefined;
    for (const collectionId of this.scheduled) {
      const widgets = this.unsaved.get(collectionId);
      if (widgets) void this.write(collectionId, widgets);
    }
    this.scheduled.clear();
  }

  private async write(collectionId: string, widgets: WidgetRecord): Promise<void> {
    try {
      await this.assets.updateCollectionSettings(collectionId, { widgets });
    } catch (error) {
      console.error(`[Atlas] Could not save the widgets of collection ${collectionId}:`, error);
    } finally {
      // A newer edit made during the write stays pending for the next one.
      if (this.unsaved.get(collectionId) === widgets) this.unsaved.delete(collectionId);
    }
  }
}
