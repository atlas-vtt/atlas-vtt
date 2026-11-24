import type { App } from 'obsidian';
import { sortOptions, tabs, type SortOption, type SortOrder, type Tab } from './types';
import { isRecord } from '../../../utils/guards';

const STORAGE_KEY = 'atlas-vtt:asset-manager';
/** Scroll positions kept, most recent first; older folders start at the top again. */
const MAX_SCROLL_POSITIONS = 50;

/** Where the asset manager was left, restored when it opens again. */
export interface AssetManagerPlace {
  /**
   * Collection of the map the manager was open over (null without a map). Opened
   * over a map of another collection, the manager starts in that collection.
   */
  mapCollection: string | null;
  collection: string;
  tab: Tab;
  folderId: string | null;
  search: string;
  tagIds: string[];
  sortBy: SortOption;
  sortOrder: SortOrder;
  collapsedSections: { folders: boolean; assets: boolean };
}

interface StoredMemory {
  place: AssetManagerPlace | null;
  scroll: Record<string, number>;
}

const isString = (value: unknown): value is string => typeof value === 'string';
const isNullableString = (value: unknown): value is string | null => value === null || isString(value);
const isTab = (value: unknown): value is Tab => tabs.some((tab) => tab === value);
const isSortOption = (value: unknown): value is SortOption => sortOptions.some((option) => option === value);

/** Trust boundary: local storage may hold data from another Atlas version, or nothing. */
function readPlace(value: unknown): AssetManagerPlace | null {
  if (!isRecord(value)) return null;
  const { mapCollection, collection, tab, folderId, search, tagIds, sortBy, sortOrder, collapsedSections } = value;
  if (!isNullableString(mapCollection) || !isString(collection) || !isNullableString(folderId)) return null;
  if (!isTab(tab) || !isString(search)) return null;
  if (!Array.isArray(tagIds) || !tagIds.every(isString)) return null;
  if (!isSortOption(sortBy)) return null;
  if (sortOrder !== 'asc' && sortOrder !== 'desc') return null;
  if (!isRecord(collapsedSections)) return null;
  return {
    mapCollection, collection, tab, folderId, search, tagIds, sortBy, sortOrder,
    collapsedSections: { folders: collapsedSections.folders === true, assets: collapsedSections.assets === true },
  };
}

function readScroll(value: unknown): Map<string, number> {
  if (!isRecord(value)) return new Map();
  return new Map(Object.entries(value).filter((entry): entry is [string, number] =>
    typeof entry[1] === 'number' && Number.isFinite(entry[1]) && entry[1] > 0));
}

/**
 * The asset manager's place (tab, collection, folder, search, tag filter, sort)
 * and the scroll position of every folder it showed. One per vault, shared by
 * the manager of every map view, and kept in the vault's local storage so it
 * survives reloads without syncing to other devices.
 */
export class AssetManagerMemory {
  private static readonly instances = new WeakMap<App, AssetManagerMemory>();

  static forApp(app: App): AssetManagerMemory {
    let memory = AssetManagerMemory.instances.get(app);
    if (!memory) {
      memory = new AssetManagerMemory(app);
      AssetManagerMemory.instances.set(app, memory);
    }
    return memory;
  }

  private place: AssetManagerPlace | null;
  private readonly scroll: Map<string, number>;

  private constructor(private readonly app: App) {
    const stored: unknown = app.loadLocalStorage(STORAGE_KEY);
    this.place = isRecord(stored) ? readPlace(stored.place) : null;
    this.scroll = readScroll(isRecord(stored) ? stored.scroll : undefined);
  }

  getPlace(): AssetManagerPlace | null {
    return this.place;
  }

  /** Remembers where the manager was left and writes the memory to local storage. */
  setPlace(place: AssetManagerPlace): void {
    this.place = place;
    this.save();
  }

  scrollTopOf(key: string): number {
    return this.scroll.get(key) ?? 0;
  }

  /** Kept in memory while scrolling; written with the next `setPlace`, when the manager closes. */
  setScrollTop(key: string, top: number): void {
    this.scroll.delete(key);
    if (top > 0) this.scroll.set(key, top);
    while (this.scroll.size > MAX_SCROLL_POSITIONS) {
      const oldest = this.scroll.keys().next().value;
      if (oldest === undefined) break;
      this.scroll.delete(oldest);
    }
  }

  private save(): void {
    const stored: StoredMemory = { place: this.place, scroll: Object.fromEntries(this.scroll) };
    this.app.saveLocalStorage(STORAGE_KEY, stored);
  }
}

/** What the manager restores when it opens: its place minus the map it was opened over. */
export type RestoredPlace = Omit<AssetManagerPlace, 'mapCollection'>;

export interface RestoreContext {
  /** The tab the manager was asked to open on (a command or button); unset restores the last one. */
  requestedTab: Tab | undefined;
  /** Collection of the map it opens over; null for the manager without a map. */
  mapCollection: string | null;
  /** Where the manager opens without a map and without a remembered place. */
  defaultCollection: string;
  folderExists: (folderId: string, collection: string, tab: Tab) => boolean;
}

const FRESH_PLACE: Omit<RestoredPlace, 'collection'> = {
  tab: 'tokens', folderId: null, search: '', tagIds: [],
  sortBy: 'name', sortOrder: 'asc', collapsedSections: { folders: false, assets: false },
};

/**
 * Where the manager opens: where it was left, unless it opens over a map of
 * another collection (then that collection's root) or on a requested tab (then
 * that tab's root). A folder that no longer exists falls back to the root.
 */
export function placeToRestore(saved: AssetManagerPlace | null, context: RestoreContext): RestoredPlace {
  const mapCollection = context.mapCollection ?? context.defaultCollection;
  if (!saved) {
    return { ...FRESH_PLACE, collection: mapCollection, tab: context.requestedTab ?? FRESH_PLACE.tab };
  }
  const sameMap = context.mapCollection === null || saved.mapCollection === context.mapCollection;
  const collection = sameMap ? saved.collection : mapCollection;
  const tab = context.requestedTab ?? saved.tab;
  const samePlace = collection === saved.collection && tab === saved.tab;
  const folderId = samePlace && saved.folderId && context.folderExists(saved.folderId, collection, tab) ? saved.folderId : null;
  return {
    collection,
    tab,
    folderId,
    search: tab === saved.tab ? saved.search : '',
    tagIds: samePlace ? saved.tagIds : [],
    sortBy: saved.sortBy,
    sortOrder: saved.sortOrder,
    collapsedSections: saved.collapsedSections,
  };
}
