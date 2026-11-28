import type { App, Plugin } from 'obsidian';
import type { LegacyPlayerBars } from '../resources/playerVisibilityMigration';
import { availableHotkeys, canShareHotkey, type MapHotkeyId, type MapHotkeys } from '../keyboard/mapHotkeys';
import { hotkeyOrigin, resolveHotkeys, withHotkey, type HotkeyOrigin } from '../keyboard/hotkeyOverrides';
import { TUTORIAL_IDS, type TutorialId } from './atlasSettings';
import { isRecord } from '../utils/guards';
import { DEVICE_PREFERENCES, deviceStorage, readDevice, writeDevice } from './deviceSettings';
import { readGpuFacts } from './gpuFacts';
import { pickLightingQuality } from '../lighting/deviceTier';
import { deviceProfile } from '../platform/deviceProfile';
import type { LightingQuality, LightingQualityLevel } from '../lighting/lightingQuality';
import { knobsOf, qualityOf, type GraphicsChoice } from '../lighting/graphicsSettings';
import type { TvScreenRecord, TvScreenSetup } from './tableTvDevice';
import { PREFERENCES, type Preference, type PreferenceChange, type PreferenceName } from './preferences/preferences';
import { applyChange, sameValue, type PreferenceRow, type PreferenceStorage, type PreferenceStore } from './preferences/preferenceRow';

export { TUTORIAL_IDS } from './atlasSettings';
export type { AtlasSettings, TutorialId } from './atlasSettings';
export type { PreferenceName } from './preferences/preferences';

/** Where the settings are kept: the plugin's `data.json`, which Obsidian syncs with the plugin's settings. */
export type PluginDataStore = Pick<Plugin, 'loadData' | 'saveData'>;

/** Keys that are no preferences and never go into the plugin's data: the input mode is the device's, the game system presets are vault files. */
const NOT_PREFERENCES = ['navigation', 'systemPresets'];

/** The file's record as the service keeps it: without the keys that are no preferences, the values other devices write checked. */
function asLoaded(loaded: Record<string, unknown>): Record<string, unknown> {
  const stored = Object.fromEntries(Object.entries(loaded).filter(([key]) => !NOT_PREFERENCES.includes(key)));
  for (const row of Object.values(PREFERENCES)) {
    if (!('onLoad' in row) || !row.onLoad) continue;
    for (const key of row.keys.filter((name) => name in stored)) {
      const checked = row.onLoad(stored[key]);
      if (checked === undefined) delete stored[key];
      else stored[key] = checked;
    }
  }
  return stored;
}

/**
 * The GM's Atlas preferences (`PREFERENCES`), read and changed by name. Synced ones are kept in the
 * plugin's data (`data.json`), device ones in the vault's local storage (`deviceSettings.ts`).
 * Without a data store (tests, a view without the plugin) the synced ones live in memory only.
 */
export class SettingsService {
  private static instances = new WeakMap<App, SettingsService>();
  static forApp(app: App | undefined): SettingsService | undefined {
    return app ? this.instances.get(app) : undefined;
  }
  private initialization?: Promise<void>;
  /**
   * The plugin's data as read, with this session's changes. Every key goes back as it came, those
   * of other versions included, and a key Atlas never changed is never written.
   */
  private stored: Record<string, unknown> = {};
  /** The plugin's data as last read from or written to the file. */
  private saved: Record<string, unknown> = {};
  private saveTimeout: number | undefined;
  private listeners = new Set<() => void>();
  /** Each preference as last read, with the stored entries it was read from. */
  private readonly reads = new Map<PreferenceName, { entries: unknown[]; value: unknown }>();
  private readonly synced: PreferenceStorage = {
    entry: (key) => this.stored[key],
    put: (change) => {
      const next = { ...this.stored };
      for (const [key, stored] of Object.entries(change)) {
        if (stored === undefined) delete next[key];
        else next[key] = stored;
      }
      this.stored = next;
    },
  };

  constructor(private readonly app: App, private readonly storageReady: Promise<unknown> = Promise.resolve(), private readonly data: PluginDataStore | null = null) {
    SettingsService.instances.set(app, this);
  }

  /**
   * Loads the plugin's data once and notifies subscribers, since views restored at startup
   * subscribe while the service still holds the defaults.
   */
  async initialize(): Promise<void> {
    await (this.initialization ??= this.loadSettings().then(() => this.notify()));
  }

  /**
   * Reads the plugin's data again after it changed on disk (another device's change delivered
   * by sync) and tells every subscriber, so dice, hotkeys and switches follow at once.
   */
  async reload(): Promise<void> {
    await this.initialize();
    const local = this.stored;
    const saved = this.saved;
    // A file a sync tool is still writing reads as nothing: the settings stay as they are.
    if (!(await this.loadSettings(true))) return;
    // A change made here and not saved yet is newer than what arrived; it stays and is saved.
    if (this.saveTimeout !== undefined) {
      const changed = [...new Set([...Object.keys(local), ...Object.keys(saved)])].filter((key) => !sameValue(local[key], saved[key]));
      this.synced.put(Object.fromEntries(changed.map((key) => [key, local[key]])));
    }
    this.notify();
  }

  /** Reads the settings; returns false, changing nothing, when `onlyRecords` is set and the data is no settings record. */
  private async loadSettings(onlyRecords = false): Promise<boolean> {
    // A failed migration is reported by the plugin's startup; settings still load.
    await this.storageReady.catch(() => undefined);
    let loaded: unknown = null;
    try {
      loaded = this.data ? await this.data.loadData() : null;
    } catch (error) {
      console.error('[SettingsService] Failed to read settings:', error);
    }
    if (onlyRecords && !isRecord(loaded)) return false;
    this.stored = isRecord(loaded) ? asLoaded(loaded) : {};
    this.saved = structuredClone(this.stored);
    return true;
  }

  private async saveSettings(): Promise<void> {
    // Saving before the data was read would write the defaults over the user's settings.
    await this.initialize();
    if (!this.data) return;
    try {
      const stored = structuredClone(this.stored);
      await this.data.saveData(stored);
      this.saved = stored;
    } catch (error) {
      console.error('[SettingsService] Failed to save settings:', error);
    }
  }

  private scheduleSave(): void {
    if (this.saveTimeout) window.clearTimeout(this.saveTimeout);
    this.saveTimeout = window.setTimeout(() => {
      this.saveTimeout = undefined;
      void this.saveSettings();
    }, 500);
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }

  /** Hears every change of a preference, and every reload; returns the unsubscribe function. */
  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Saves at once instead of after the wait. */
  async saveSettingsNow(): Promise<void> {
    if (this.saveTimeout) {
      window.clearTimeout(this.saveTimeout);
      this.saveTimeout = undefined;
    }
    await this.saveSettings();
  }

  private storage(store: PreferenceStore): PreferenceStorage {
    return store === 'synced' ? this.synced : deviceStorage(this.app);
  }

  /**
   * A preference as stored, what Atlas cannot use read as its default. The same value comes back
   * until what is stored under its keys changes, so views may compare it by identity.
   */
  get<N extends PreferenceName>(name: N): Preference<N> {
    const row = PREFERENCES[name];
    const storage = this.storage(row.store);
    const entries = row.keys.map((key) => storage.entry(key));
    const kept = this.reads.get(name);
    if (kept && kept.entries.every((entry, index) => entry === entries[index])) return kept.value as Preference<N>;
    const value = row.read(storage.entry);
    this.reads.set(name, { entries, value });
    return value as Preference<N>;
  }

  /**
   * Changes a preference: the whole value, or the fields named of one kept as a record. A change
   * that reads back as the value already there stores nothing and tells no one; any other is
   * stored (synced ones after a short wait) and then told to every listener.
   */
  set<N extends PreferenceName>(name: N, change: PreferenceChange<N>): void {
    const row = PREFERENCES[name] as PreferenceRow<unknown, PreferenceChange<N>>;
    if (!applyChange(row, change, this.storage(row.store))) return;
    if (row.store === 'synced') this.scheduleSave();
    this.notify();
  }

  getHotkeys(): MapHotkeys { return resolveHotkeys(this.get('hotkeys')); }

  getHotkeyOrigin(id: MapHotkeyId): HotkeyOrigin { return hotkeyOrigin(this.get('hotkeys'), id); }

  setHotkey(id: MapHotkeyId, key: string): void {
    const bindings = this.getHotkeys();
    const conflict = key && availableHotkeys(false).find(action => action.id !== id && bindings[action.id] === key && !canShareHotkey(action.id, id));
    if (conflict) throw new Error(`Already assigned to ${conflict.label}. Clear that shortcut first.`);
    this.set('hotkeys', withHotkey(this.get('hotkeys'), id, key));
  }

  resetHotkeys(): void {
    this.set('hotkeys', {});
  }

  shouldShowTutorial(id: TutorialId): boolean {
    const onboarding = this.get('onboarding');
    return onboarding.enabled && !onboarding.completed[id];
  }

  /** Whether this GM has been through the welcome wizard, which every GM sees once, with tutorials switched on or off. */
  hasBeenWelcomed(): boolean {
    return this.get('onboarding').completed.welcome === true;
  }

  completeTutorial(id: TutorialId): void {
    this.set('onboarding', { completed: { ...this.get('onboarding').completed, [id]: true } });
  }

  /** Shows one tutorial again from its first step, also while the others are switched off. */
  replayTutorial(id: TutorialId): void {
    const completed = { ...this.get('onboarding').completed };
    delete completed[id];
    this.set('onboarding', { enabled: true, completed });
  }

  markTokenImported(): void {
    this.set('onboarding', { tokenImported: true });
  }

  /** How many tutorials the user finished or skipped; either way they do not show again until reset. */
  finishedTutorialCount(): number {
    const { completed } = this.get('onboarding');
    return TUTORIAL_IDS.filter((id) => completed[id]).length;
  }

  resetTutorials(): void {
    this.set('onboarding', { enabled: true, completed: {} });
  }

  /** Whether the level in effect is Atlas' pick for this device's graphics, nothing chosen yet. */
  isLightingQualityPicked(): boolean {
    return readDevice(this.app, DEVICE_PREFERENCES.graphics) === null;
  }

  /** Chooses a preset whole, every knob its own. */
  setLightingQuality(level: LightingQualityLevel): void {
    this.setGraphics({ preset: level, overrides: {} });
  }

  /** The preset this device's graphics follow and the knobs set away from it: the GM's choice, else the level Atlas picked. */
  getGraphics(): GraphicsChoice {
    return readDevice(this.app, DEVICE_PREFERENCES.graphics) ?? { preset: this.pickedLightingQuality(), overrides: {} };
  }

  /** The graphics are this device's. Listeners hear only of a change in effect. */
  setGraphics(choice: GraphicsChoice): void {
    this.storeGraphics(choice);
  }

  /** Forgets the choice: the level Atlas picked for the device holds again. */
  resetGraphics(): void {
    this.storeGraphics(null);
  }

  private storeGraphics(choice: GraphicsChoice | null): void {
    const shown = this.getGraphicsQuality();
    writeDevice(this.app, DEVICE_PREFERENCES.graphics, choice);
    if (!sameValue(shown, this.getGraphicsQuality())) this.notify();
  }

  /** What the lighting, the liquids and the composite read: the quality the choice describes (`qualityOf`). */
  getGraphicsQuality(): LightingQuality {
    return qualityOf(knobsOf(this.getGraphics()));
  }

  /**
   * The level picked for this device's graphics (`pickLightingQuality`) the first time it is
   * asked, then stored, so it never changes by itself. The finest level the device's profile
   * allows (`high` on a desktop) where the graphics cannot be read, which is asked again next time.
   */
  private pickedLightingQuality(): LightingQualityLevel {
    const stored = readDevice(this.app, DEVICE_PREFERENCES.pickedLightingQuality);
    if (stored) return stored;
    const finest = deviceProfile().budgets.lightingQualityDefault;
    const facts = readGpuFacts();
    if (!facts) return finest;
    const level = pickLightingQuality(facts, finest);
    writeDevice(this.app, DEVICE_PREFERENCES.pickedLightingQuality, level);
    return level;
  }

  /**
   * The player-window switches for HP and the secondary bar that older versions
   * stored, or null when there are none or they were carried over. Each resource now
   * says itself whether players see it. The switches stay in the file: an older Atlas
   * on the same vault still reads them.
   */
  legacyPlayerBars(): LegacyPlayerBars | null {
    const stored = this.stored.localPlayerView;
    if (!isRecord(stored) || stored.tokenBarsCarriedOver === true) return null;
    if (!('showTokenHP' in stored) && !('showTokenStress' in stored)) return null;
    return { hp: stored.showTokenHP === true, stress: stored.showTokenStress === true };
  }

  /** Notes that the old switches were carried over, telling no listener: nothing they show changes. */
  clearLegacyPlayerBars(): void {
    const stored = this.stored.localPlayerView;
    this.synced.put({ localPlayerView: { ...(isRecord(stored) ? stored : {}), tokenBarsCarriedOver: true } });
    this.scheduleSave();
  }

  /**
   * Changes what this device keeps of the screen `key`. A screen is stored from its first
   * change: turned at once (rotation 0 until one is given), set up only once it holds a
   * positive `pxPerMm` (`setupOf`); a `pxPerMm` that is none leaves the one it had.
   */
  setTvScreenSetup(key: string, patch: Partial<TvScreenSetup>): void {
    const device = this.get('tableTvDevice');
    const { pxPerMm, ...rest } = patch;
    const screen: TvScreenRecord = { rotation: 0, ...device.screens[key], ...rest };
    if (pxPerMm !== undefined && Number.isFinite(pxPerMm) && pxPerMm > 0) screen.pxPerMm = pxPerMm;
    this.set('tableTvDevice', { screens: { ...device.screens, [key]: screen } });
  }
}
