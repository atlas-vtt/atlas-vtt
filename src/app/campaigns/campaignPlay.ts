import type { App } from 'obsidian';
import { isAssetId } from './campaignValues';

const STORAGE_KEY = 'atlas-vtt:table-campaign';
/** Where Atlas 0.9.0 kept a campaign the GM played with or without a table: never read, only removed. */
const LEGACY_KEY = 'atlas-vtt:playing-campaign';

type DeviceStorage = Pick<App, 'loadLocalStorage' | 'saveLocalStorage'>;

/**
 * The campaign this device is playing, or none: the campaign of the online table this device runs.
 * Only online play sets it (`OnlineControl`), when the table runs; it is cleared when the table ends,
 * or when the campaign is deleted, which ends its table too, so no campaign is played without its
 * table. Which campaign a table plays is a fact about this device, never about the vault, so it is
 * kept in the vault's local storage, where a table that comes back after a reload finds it, and
 * never synced.
 */
export class CampaignPlay {
  private static readonly instances = new WeakMap<DeviceStorage, CampaignPlay>();

  static forApp(app: DeviceStorage): CampaignPlay {
    let play = CampaignPlay.instances.get(app);
    if (!play) {
      play = new CampaignPlay(app);
      CampaignPlay.instances.set(app, play);
    }
    return play;
  }

  private id: string | null;
  private readonly listeners = new Set<() => void>();

  private constructor(private readonly storage: DeviceStorage) {
    // Trust boundary: local storage may hold another version's value, or nothing.
    const stored: unknown = storage.loadLocalStorage(STORAGE_KEY);
    this.id = isAssetId(stored) ? stored : null;
    // A campaign 0.9.0 left played, perhaps without a table, is never taken up.
    if (storage.loadLocalStorage(LEGACY_KEY) !== null) storage.saveLocalStorage(LEGACY_KEY, null);
  }

  /** The id of the campaign being played, or null. */
  playing(): string | null {
    return this.id;
  }

  /** Plays the campaign `id`, in place of any other. */
  play(id: string): void {
    this.set(id);
  }

  stop(): void {
    this.set(null);
  }

  /** Calls `listener` whenever another campaign, or none, is being played. */
  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  private set(id: string | null): void {
    if (id === this.id) return;
    this.id = id;
    this.storage.saveLocalStorage(STORAGE_KEY, id);
    for (const listener of [...this.listeners]) listener();
  }
}
