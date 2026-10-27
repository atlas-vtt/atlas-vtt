import { TFile, type App, type EventRef, type TAbstractFile } from 'obsidian';
import { ensureFolder } from '../plugin/vaultFolders';
import { deviceId } from '../plugin/deviceId';
import { debounce, type DebouncedFunction } from '../../utils/debounce';
import { readLootHistory, type LootRoll } from './lootHistory';
import {
  EMPTY_DEVICE_HISTORY, clearedHistory, mergeLootHistories, prunedHistory, readDeviceLootHistory, serializeDeviceLootHistory,
  withLegacyRolls, withReplacedRoll, withRoll, withoutRoll, type DeviceLootHistory,
} from './deviceLootHistory';
import { deviceLootHistoryPath, legacyLootHistoryPath, lootHistoryCollectionOf, lootHistoryFolder } from './lootHistoryPaths';

/** Several rolls in a row are written together. */
const SAVE_DELAY_MS = 800;
/** Collections whose old single history file this device has taken into its own. Never synced. */
const LEGACY_MIGRATED_KEY = 'atlas-vtt-loot-history-migrated';

type Listener = (rolls: readonly LootRoll[]) => void;

interface CollectionHistory {
  /** What this device rolled and changed; the only file it writes. */
  own: DeviceLootHistory;
  /** Every other device's file, by path. */
  others: Map<string, DeviceLootHistory>;
  rolls: readonly LootRoll[];
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * The loot rolled in each collection, shared by all its maps and all devices.
 * Each device writes only its own file in the collection's `loot-history/`
 * folder, so sync never has two versions of one file to choose between; the
 * history shown merges every device's file. Files arriving by sync are
 * followed through vault events, every open map is told about changes, and
 * this device's file is written shortly after the last change.
 */
export class LootHistoryStore {
  private static readonly instances = new WeakMap<App, LootHistoryStore>();

  /** Writes pending changes now and stops following the vault, when the plugin unloads. */
  static release(app: App): void {
    const store = this.instances.get(app);
    if (!store) return;
    for (const save of store.saves.values()) save.flush();
    for (const ref of store.eventRefs) app.vault.offref(ref);
    this.instances.delete(app);
  }

  static forApp(app: App): LootHistoryStore {
    let store = this.instances.get(app);
    if (!store) {
      store = new LootHistoryStore(app);
      this.instances.set(app, store);
    }
    return store;
  }

  private readonly histories = new Map<string, CollectionHistory>();
  private readonly reads = new Map<string, Promise<readonly LootRoll[]>>();
  private readonly listeners = new Map<string, Set<Listener>>();
  private readonly saves = new Map<string, DebouncedFunction<[]>>();
  private readonly eventRefs: EventRef[] = [];
  private readonly device: string;

  private constructor(private readonly app: App) {
    this.device = deviceId(app);
    const follow = (file: TAbstractFile): void => { void this.followFile(file.path); };
    this.eventRefs.push(
      app.vault.on('create', follow),
      app.vault.on('modify', follow),
      app.vault.on('delete', follow),
      app.vault.on('rename', (file, oldPath) => {
        void this.followFile(oldPath);
        follow(file);
      }),
    );
  }

  /** The collection's rolls, read from its files the first time. */
  load(collectionId: string): Promise<readonly LootRoll[]> {
    const known = this.histories.get(collectionId);
    if (known) return Promise.resolve(known.rolls);
    let read = this.reads.get(collectionId);
    if (!read) {
      read = this.read(collectionId);
      this.reads.set(collectionId, read);
    }
    return read;
  }

  /** Calls `listener` with the collection's rolls whenever they change. */
  subscribe(collectionId: string, listener: Listener): () => void {
    const listeners = this.listeners.get(collectionId) ?? new Set<Listener>();
    listeners.add(listener);
    this.listeners.set(collectionId, listeners);
    return () => listeners.delete(listener);
  }

  add(collectionId: string, roll: LootRoll): void {
    void this.edit(collectionId, (own) => withRoll(own, roll));
  }

  /** Puts `roll` in place of the roll of its id (a result rolled again on its card); nothing once it was removed. */
  replace(collectionId: string, roll: LootRoll): void {
    void this.edit(collectionId, (own, others) => withReplacedRoll(own, others, roll));
  }

  remove(collectionId: string, rollId: string): void {
    void this.edit(collectionId, (own, others) => withoutRoll(own, others, rollId));
  }

  clear(collectionId: string): void {
    void this.edit(collectionId, (_own, others) => clearedHistory(others));
  }

  private ownPath(collectionId: string): string {
    return deviceLootHistoryPath(collectionId, this.device);
  }

  private async readFile(path: string): Promise<DeviceLootHistory | null> {
    const file = this.app.vault.getFileByPath(path);
    if (!file) return null;
    try {
      return readDeviceLootHistory(parseJson(await this.app.vault.read(file)));
    } catch (error) {
      console.error(`[Atlas] Could not read the loot history ${path}:`, error);
      return null;
    }
  }

  private async read(collectionId: string): Promise<readonly LootRoll[]> {
    const ownPath = this.ownPath(collectionId);
    const others = new Map<string, DeviceLootHistory>();
    let own = EMPTY_DEVICE_HISTORY;
    for (const child of this.app.vault.getFolderByPath(lootHistoryFolder(collectionId))?.children ?? []) {
      if (!(child instanceof TFile) || child.extension !== 'json') continue;
      const history = await this.readFile(child.path);
      if (!history) continue;
      if (child.path === ownPath) own = history;
      else others.set(child.path, history);
    }
    const history: CollectionHistory = { own, others, rolls: [] };
    history.rolls = mergeLootHistories([own, ...others.values()]);
    this.histories.set(collectionId, history);
    this.reads.delete(collectionId);
    await this.takeLegacyHistory(collectionId);
    return this.histories.get(collectionId)?.rolls ?? history.rolls;
  }

  /** Takes the rolls of an earlier version's single history file into this device's own, once per device. */
  private async takeLegacyHistory(collectionId: string): Promise<void> {
    const stored: unknown = this.app.loadLocalStorage(LEGACY_MIGRATED_KEY);
    const migrated = Array.isArray(stored) ? stored.filter((id): id is string => typeof id === 'string') : [];
    if (migrated.includes(collectionId)) return;
    const path = legacyLootHistoryPath(collectionId);
    try {
      if (await this.app.vault.adapter.exists(path)) {
        const legacy = readLootHistory(parseJson(await this.app.vault.adapter.read(path)));
        if (legacy.length > 0) await this.edit(collectionId, (own) => withLegacyRolls(own, legacy), { now: true });
      }
      this.app.saveLocalStorage(LEGACY_MIGRATED_KEY, [...migrated, collectionId]);
    } catch (error) {
      console.error(`[Atlas] Could not carry over the loot history of collection ${collectionId}:`, error);
    }
  }

  /** A history file of another device was created, changed, moved or deleted, perhaps by sync. */
  private async followFile(path: string): Promise<void> {
    const collectionId = lootHistoryCollectionOf(path);
    const history = collectionId ? this.histories.get(collectionId) : undefined;
    // This device's own file changes only through this store.
    if (!collectionId || !history || path === this.ownPath(collectionId)) return;
    const read = await this.readFile(path);
    if (read) history.others.set(path, read);
    else history.others.delete(path);
    this.publish(collectionId, history);
  }

  private publish(collectionId: string, history: CollectionHistory): void {
    history.rolls = mergeLootHistories([history.own, ...history.others.values()]);
    for (const listener of this.listeners.get(collectionId) ?? []) listener(history.rolls);
  }

  private async edit(
    collectionId: string,
    change: (own: DeviceLootHistory, others: readonly DeviceLootHistory[]) => DeviceLootHistory,
    { now = false } = {},
  ): Promise<void> {
    await this.load(collectionId);
    // The cache, not the value read: another edit may have landed meanwhile.
    const history = this.histories.get(collectionId);
    if (!history) return;
    history.own = change(history.own, [...history.others.values()]);
    this.publish(collectionId, history);

    if (now) {
      await this.write(collectionId);
      return;
    }
    let save = this.saves.get(collectionId);
    if (!save) {
      save = debounce(() => this.write(collectionId), SAVE_DELAY_MS);
      this.saves.set(collectionId, save);
    }
    save();
  }

  private async write(collectionId: string): Promise<void> {
    const history = this.histories.get(collectionId);
    if (!history) return;
    const path = this.ownPath(collectionId);
    try {
      const content = serializeDeviceLootHistory(prunedHistory(history.own, [...history.others.values()]));
      const existing = this.app.vault.getFileByPath(path);
      if (existing) {
        await this.app.vault.process(existing, () => content);
      } else {
        await ensureFolder(this.app, lootHistoryFolder(collectionId));
        await this.app.vault.create(path, content);
      }
    } catch (error) {
      console.error(`[Atlas] Could not save the loot history of collection ${collectionId}:`, error);
    }
  }
}
