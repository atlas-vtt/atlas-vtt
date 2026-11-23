import type { App } from 'obsidian';
import type { SettingsService } from '../services/SettingsService';
import { LOOK_DICE_FONT, LOOK_FOG_EDGE_STYLE, RETIRED_THEME_NAME, isAtlasLook, type AtlasLook } from './atlasLook';

/** The GM's own Obsidian theme, or one of Atlas' looks drawn over Obsidian's default theme. */
export type LookChoice = 'own' | AtlasLook;

/** The look of this device: every choice is a word, never a falsy value Obsidian would drop. */
export const LOOK_STORAGE_KEY = 'atlas-vtt:look';
/** The theme the GM used before picking an Atlas look, as JSON, so the default theme `''` is stored as `'""'`. */
export const PREVIOUS_THEME_STORAGE_KEY = 'atlas-vtt:look-previous-theme';

/** Obsidian's own theme, which Atlas' looks are drawn over. */
const DEFAULT_THEME = '';

const byApp = new WeakMap<App, LookService>();

const isLookChoice = (value: unknown): value is LookChoice => value === 'own' || isAtlasLook(value);

/**
 * Which look Atlas shows on this device. A look is a fact of the device (a laptop and the table's screen may differ),
 * kept in the vault's local storage. While an Atlas look is on Obsidian runs its default theme, and the GM's theme
 * comes back when they take their own look again or disable Atlas; picking another theme in Obsidian is taking it.
 */
export class LookService {
  static forApp(app: App, settings: SettingsService): LookService {
    let looks = byApp.get(app);
    if (!looks) byApp.set(app, looks = new LookService(app, settings));
    return looks;
  }

  /** Forgets the app's service, whose settings go with the plugin that unloads. */
  static release(app: App): void {
    byApp.get(app)?.listeners.clear();
    byApp.delete(app);
  }

  private choice: LookChoice;
  private readonly listeners = new Set<() => void>();

  private constructor(private readonly app: App, private readonly settings: SettingsService) {
    this.choice = this.load(LOOK_STORAGE_KEY, isLookChoice) ?? 'own';
  }

  get(): LookChoice {
    return this.choice;
  }

  /** An Atlas look switches Obsidian to its default theme, the fog to the look's edge and the dice to its numerals; the GM's own puts their theme back. */
  set(choice: LookChoice): void {
    if (choice === this.choice) return;
    if (isAtlasLook(choice)) {
      if (this.choice === 'own') {
        this.save(PREVIOUS_THEME_STORAGE_KEY, JSON.stringify(this.theme()));
        this.app.customCss?.setTheme?.(DEFAULT_THEME);
      }
      this.settings.setFogEdge({ style: LOOK_FOG_EDGE_STYLE[choice] });
      this.settings.setDiceLook({ font: LOOK_DICE_FONT[choice] });
    } else {
      this.restoreTheme();
    }
    this.choose(choice);
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  /** The GM's own theme: the one in use while they keep it, else the one remembered; `''` is Obsidian's default. */
  ownThemeName(): string {
    return this.choice === 'own' ? this.theme() : this.previousThemeName();
  }

  /** The theme the GM used before their Atlas look; the default theme when none is remembered. */
  previousThemeName(): string {
    const stored = this.load(PREVIOUS_THEME_STORAGE_KEY, (value): value is string => typeof value === 'string');
    if (stored === null) return DEFAULT_THEME;
    try {
      const name: unknown = JSON.parse(stored);
      return typeof name === 'string' ? name : DEFAULT_THEME;
    } catch {
      return DEFAULT_THEME;
    }
  }

  /**
   * At start: a GM still on the retired Atlas theme gets its look in Atlas instead, and an Atlas look whose default
   * theme was replaced while Atlas was off (another device's sync, the GM in Obsidian's settings) gives way to it.
   */
  reconcileAtStart(): void {
    if (this.theme() === RETIRED_THEME_NAME) {
      this.save(PREVIOUS_THEME_STORAGE_KEY, JSON.stringify(DEFAULT_THEME));
      this.app.customCss?.setTheme?.(DEFAULT_THEME);
      this.choose('mediaeval');
    } else if (isAtlasLook(this.choice) && this.theme() !== DEFAULT_THEME) {
      this.choose('own');
    }
  }

  /** Obsidian announces a theme switch as `css-change`: a theme picked while an Atlas look is on is the GM's own look. */
  followThemeChange(): void {
    if (isAtlasLook(this.choice) && this.theme() !== DEFAULT_THEME) this.choose('own');
  }

  /**
   * Puts the GM's theme back when Atlas is disabled, not when it only unloads (a reload, an update, Obsidian quitting).
   * Obsidian takes a plugin out of `enabledPlugins` before it unloads it (`disablePluginAndSave`).
   */
  restoreOnDisable(pluginId: string): void {
    if (this.app.plugins?.enabledPlugins.has(pluginId) !== false) return;
    if (isAtlasLook(this.choice)) this.restoreTheme();
  }

  private restoreTheme(): void {
    const previous = this.previousThemeName();
    const themes = this.app.customCss?.themes ?? {};
    if (previous !== DEFAULT_THEME && Object.hasOwn(themes, previous)) this.app.customCss?.setTheme?.(previous);
  }

  private choose(choice: LookChoice): void {
    if (choice === this.choice) return;
    this.choice = choice;
    this.save(LOOK_STORAGE_KEY, choice);
    for (const listener of Array.from(this.listeners)) listener();
  }

  private theme(): string {
    return this.app.customCss?.theme ?? DEFAULT_THEME;
  }

  private load<T>(key: string, accepts: (value: unknown) => value is T): T | null {
    try {
      const stored: unknown = this.app.loadLocalStorage(key);
      return accepts(stored) ? stored : null;
    } catch (error) {
      console.error('[Atlas] Could not read the look of this device', error);
      return null;
    }
  }

  private save(key: string, value: string): void {
    try {
      this.app.saveLocalStorage(key, value);
    } catch (error) {
      console.error('[Atlas] Could not save the look of this device', error);
    }
  }
}
