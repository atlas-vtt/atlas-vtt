import type { LegacyPlayerBars } from '../resources/playerVisibilityMigration';
import type { App, Plugin } from 'obsidian';
import { availableHotkeys, canShareHotkey, type MapHotkeyId, type MapHotkeys } from '../keyboard/mapHotkeys';
import { hotkeyOrigin, resolveHotkeys, withHotkey, type HotkeyOrigin } from '../keyboard/hotkeyOverrides';
import { resolveLaserPointerSettings, type LaserPointerSettings } from '../tools/laserPointerSettings';
import { isDiceDisplay, type DiceDisplay } from '../dice3d/diceDisplay';
import type { ExperimentalFeatureId } from '../experimental/experimentalFeatures';
import { DEFAULT_DICE_LOOK, isDiceColour, isDiceFont, type DiceLook } from '../dice3d/diceLook';
import { readToolbarLayout, type StoredToolbarLayout } from '../toolbar/toolbarLayout';
import {
  DEFAULT_SETTINGS,
  isRecord,
  defaultInputMode,
  readStoredSettings,
  storedSettings,
  type AtlasSettings,
  type NavigationInputMode,
  type NavigationSettings,
  type TutorialId,
  TUTORIAL_IDS,
} from './atlasSettings';
import { loadInputMode, loadLightingQuality, saveInputMode, saveLightingQuality } from './deviceSettings';
import type { LightingQualityLevel } from '../lighting/lightingQuality';

export { TUTORIAL_IDS } from './atlasSettings';
export type { AtlasSettings, NavigationInputMode, NavigationSettings, TutorialId } from './atlasSettings';

/** Where the settings are kept: the plugin's `data.json`, which Obsidian syncs with the plugin's settings. */
export type PluginDataStore = Pick<Plugin, 'loadData' | 'saveData'>;

type SettingsListener = (settings: AtlasSettings) => void;

/**
 * The GM's Atlas preferences, kept in the plugin's data (`data.json`), except the input mode
 * and the lighting quality, which belong to the device (`deviceSettings.ts`). Without a data store (tests, a view
 * without the plugin) the settings live in memory only.
 */
export class SettingsService {
  private static instances = new WeakMap<App, SettingsService>();
  static forApp(app: App | undefined): SettingsService | undefined {
    return app ? this.instances.get(app) : undefined;
  }
  private initialization?: Promise<void>;
  private app: App;
  private settings: AtlasSettings;
  /** Bindings of actions a newer Atlas added, written back unchanged. */
  private foreignHotkeys: Record<string, string> = {};
  private saveTimeout: number | undefined;
  /** The settings as last read from or written to the plugin's data. */
  private saved: AtlasSettings;
  private listeners: Set<SettingsListener> = new Set();
  /** Settles once the plugin's data is in place (after the startup migration). */
  private readonly storageReady: Promise<unknown>;

  constructor(app: App, storageReady: Promise<unknown> = Promise.resolve(), private readonly data: PluginDataStore | null = null) {
    this.app = app;
    this.storageReady = storageReady;
    SettingsService.instances.set(app, this);
    this.settings = { ...DEFAULT_SETTINGS, navigation: { inputMode: this.deviceInputMode() } };
    this.saved = structuredClone(this.settings);
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
    const local = this.settings;
    const saved = this.saved;
    // A file a sync tool is still writing reads as nothing: the settings stay as they are.
    if (!(await this.loadSettings(true))) return;
    // A change made here and not saved yet is newer than what arrived; it stays and is saved.
    if (this.saveTimeout !== undefined) {
      for (const key of Object.keys(local) as Array<keyof AtlasSettings>) {
        if (JSON.stringify(local[key]) !== JSON.stringify(saved[key])) this.settings = { ...this.settings, [key]: local[key] };
      }
    }
    this.notify();
  }

  private deviceInputMode(): NavigationInputMode {
    return loadInputMode(this.app) ?? defaultInputMode();
  }

  /** Reads the settings; returns false, changing nothing, when `onlyRecords` is set and the data is no settings record. */
  private async loadSettings(onlyRecords = false): Promise<boolean> {
    // A failed migration is reported by the plugin's startup; settings still load.
    await this.storageReady.catch(() => undefined);
    let stored: unknown = null;
    try {
      stored = this.data ? await this.data.loadData() : null;
    } catch (error) {
      console.error('[SettingsService] Failed to read settings:', error);
    }
    if (onlyRecords && !isRecord(stored)) return false;
    const read = readStoredSettings(stored, this.deviceInputMode());
    this.settings = read.settings;
    // A copy: setters change the settings in place.
    this.saved = structuredClone(read.settings);
    this.foreignHotkeys = read.foreignHotkeys;
    return true;
  }

  private async saveSettings(): Promise<void> {
    // Saving before the data was read would write the defaults over the user's settings.
    await this.initialize();
    if (!this.data) return;
    const settings = this.settings;
    try {
      const stored = structuredClone(settings);
      await this.data.saveData(storedSettings(stored, this.foreignHotkeys));
      this.saved = stored;
    } catch (error) {
      console.error('[SettingsService] Failed to save settings:', error);
    }
  }

  private scheduleSave(): void {
    if (this.saveTimeout) {
      window.clearTimeout(this.saveTimeout);
    }

    this.saveTimeout = window.setTimeout(() => {
      this.saveTimeout = undefined;
      void this.saveSettings();
    }, 500); // Debounce saves by 500ms
  }

  /** Persist (debounced) and notify subscribers of the new settings. */
  private commit(): void {
    this.scheduleSave();
    this.notify();
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener(this.getAllSettings());
    }
  }

  /**
   * Subscribe to settings changes. Returns an unsubscribe function.
   */
  onChange(listener: SettingsListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getHotkeys(): MapHotkeys { return resolveHotkeys(this.settings.hotkeys); }

  getHotkeyOrigin(id: MapHotkeyId): HotkeyOrigin { return hotkeyOrigin(this.settings.hotkeys, id); }

  setHotkey(id: MapHotkeyId, key: string): void {
    const bindings = this.getHotkeys();
    // The shortcuts of an experimental feature keep their keys while it is off.
    const conflict = key && availableHotkeys().find(action => action.id !== id && bindings[action.id] === key && !canShareHotkey(action.id, id));
    if (conflict) throw new Error(`Already assigned to ${conflict.label}. Clear that shortcut first.`);
    this.settings.hotkeys = withHotkey(this.settings.hotkeys, id, key);
    this.commit();
  }

  resetHotkeys(): void {
    this.settings.hotkeys = {};
    this.commit();
  }

  shouldShowTutorial(id: TutorialId): boolean {
    return this.settings.onboarding.enabled && !this.settings.onboarding.completed[id];
  }

  completeTutorial(id: TutorialId): void {
    this.settings.onboarding = { ...this.settings.onboarding, completed: { ...this.settings.onboarding.completed, [id]: true } };
    this.commit();
  }

  markTokenImported(): void {
    if (this.settings.onboarding.tokenImported) return;
    this.settings.onboarding = { ...this.settings.onboarding, tokenImported: true };
    this.commit();
  }

  /** How many tutorials the user finished or skipped; either way they do not show again until reset. */
  finishedTutorialCount(): number {
    return TUTORIAL_IDS.filter((id) => this.settings.onboarding.completed[id]).length;
  }

  resetTutorials(): void {
    this.settings.onboarding = { ...this.settings.onboarding, enabled: true, completed: {} };
    this.commit();
  }

  // Navigation settings
  getNavigationSettings(): NavigationSettings {
    return { ...this.settings.navigation };
  }

  /** The input mode is this device's: it goes to local storage, not into the synced settings. */
  setNavigationSettings(settings: Partial<NavigationSettings>): void {
    this.settings.navigation = { ...this.settings.navigation, ...settings };
    saveInputMode(this.app, this.settings.navigation.inputMode);
    this.notify();
  }

  /** How much the lighting may ask of this device's graphics; `high` until chosen. */
  getLightingQuality(): LightingQualityLevel {
    return loadLightingQuality(this.app) ?? 'high';
  }

  /** The lighting quality is this device's: it goes to local storage, not into the synced settings. */
  setLightingQuality(level: LightingQualityLevel): void {
    if (this.getLightingQuality() === level) return;
    saveLightingQuality(this.app, level);
    this.notify();
  }

  getLaserPointerSettings(): LaserPointerSettings {
    return resolveLaserPointerSettings(this.settings.laserPointer);
  }

  setLaserPointerSettings(settings: Partial<LaserPointerSettings>): void {
    // Spread over the stored record, so fields a newer Atlas added survive.
    this.settings.laserPointer = { ...this.settings.laserPointer, ...resolveLaserPointerSettings({ ...this.settings.laserPointer, ...settings }) };
    this.commit();
  }

  /** The stored choice, or normal dice when the file holds something else. */
  getDiceDisplay(): DiceDisplay {
    return isDiceDisplay(this.settings.diceDisplay) ? this.settings.diceDisplay : 'full';
  }

  setDiceDisplay(display: DiceDisplay): void {
    if (this.settings.diceDisplay === display) return;
    this.settings.diceDisplay = display;
    this.commit();
  }

  /** Whether the GM switched an experimental feature on: off unless the file says `true`. */
  isExperimentalOn(id: ExperimentalFeatureId): boolean {
    return this.settings.experimental[id] === true;
  }

  setExperimental(id: ExperimentalFeatureId, on: boolean): void {
    if (this.isExperimentalOn(id) === on) return;
    this.settings.experimental = { ...this.settings.experimental, [id]: on };
    this.commit();
  }

  /** The stored toolbar layout; resolve it with `resolveToolbarLayout`. */
  getToolbarLayout(): StoredToolbarLayout {
    return this.settings.toolbar;
  }

  /** Stores a layout already in stored form (see `storedToolbarLayout`); an unchanged layout writes nothing. */
  setToolbarLayout(next: StoredToolbarLayout): void {
    const read = readToolbarLayout(next);
    if (JSON.stringify(read) === JSON.stringify(this.settings.toolbar)) return;
    this.settings.toolbar = read;
    this.commit();
  }

  /** The stored look, with the defaults for anything the file holds that Atlas does not know. */
  getDiceLook(): DiceLook {
    return {
      colour: isDiceColour(this.settings.diceColour) ? this.settings.diceColour : DEFAULT_DICE_LOOK.colour,
      font: isDiceFont(this.settings.diceFont) ? this.settings.diceFont : DEFAULT_DICE_LOOK.font,
    };
  }

  setDiceLook(look: Partial<DiceLook>): void {
    const next = { ...this.getDiceLook(), ...look };
    if (next.colour === this.settings.diceColour && next.font === this.settings.diceFont) return;
    this.settings.diceColour = next.colour;
    this.settings.diceFont = next.font;
    this.commit();
  }

  // Local Player View settings
  /**
   * The player-window switches for HP and the secondary bar that older versions
   * stored, or null when there are none or they were carried over. Each resource now
   * says itself whether players see it. The switches stay in the file: an older Atlas
   * on the same vault still reads them.
   */
  legacyPlayerBars(): LegacyPlayerBars | null {
    const stored: Record<string, unknown> = this.settings.localPlayerView;
    if (stored.tokenBarsCarriedOver === true) return null;
    if (!('showTokenHP' in stored) && !('showTokenStress' in stored)) return null;
    return { hp: stored.showTokenHP === true, stress: stored.showTokenStress === true };
  }

  clearLegacyPlayerBars(): void {
    const stored: Record<string, unknown> = this.settings.localPlayerView;
    stored.tokenBarsCarriedOver = true;
    this.scheduleSave();
  }

  getLocalPlayerViewSettings(): AtlasSettings['localPlayerView'] {
    return { ...this.settings.localPlayerView };
  }

  setLocalPlayerViewSettings(settings: Partial<AtlasSettings['localPlayerView']>): void {
    this.settings.localPlayerView = { ...this.settings.localPlayerView, ...settings };
    this.commit();
  }

  /**
   * Force an immediate save (no debounce)
   */
  async saveSettingsNow(): Promise<void> {
    // Clear any pending debounced save
    if (this.saveTimeout) {
      window.clearTimeout(this.saveTimeout);
      this.saveTimeout = undefined;
    }
    await this.saveSettings();
  }

  // Generic getter for accessing nested settings
  getSetting<K extends keyof AtlasSettings>(key: K): AtlasSettings[K] {
    return this.settings[key];
  }

  // Generic setter for updating nested settings
  setSetting<K extends keyof AtlasSettings>(key: K, value: AtlasSettings[K]): void {
    this.settings[key] = value;
    this.commit();
  }

  // Get all settings
  getAllSettings(): AtlasSettings {
    return { ...this.settings };
  }

  // Reset to default settings
  resetToDefaults(): void {
    this.settings = { ...DEFAULT_SETTINGS, navigation: this.settings.navigation };
    this.commit();
  }
}
