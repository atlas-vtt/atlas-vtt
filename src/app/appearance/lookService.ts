import type { App } from 'obsidian';
import type { SettingsService } from '../services/SettingsService';
import { LOOK_DICE_FONT, LOOK_FOG_EDGE_STYLE, isAtlasLook, type AtlasLook } from './atlasLook';

/** The GM's own Obsidian theme, or one of Atlas' looks drawn over Obsidian's default theme. */
export type LookChoice = 'own' | AtlasLook;

/** The look of this device: every choice is a word, never a falsy value Obsidian would drop. */
export const LOOK_STORAGE_KEY = 'atlas-vtt:look';
/** The theme the GM used before picking an Atlas look, as JSON, so the default theme `''` is stored as `'""'`. */
export const PREVIOUS_THEME_STORAGE_KEY = 'atlas-vtt:look-previous-theme';
/** The colour the Medieval look paints its ivy in, `#rrggbb`, or `natural` for its own greens. */
export const IVY_COLOUR_STORAGE_KEY = 'atlas-vtt:ivy-colour';
const NATURAL_IVY = 'natural';
/** Whether every token wears a bow (Yassify), `on` or `off`: words, as Obsidian drops falsy values. */
export const YASSIFY_STORAGE_KEY = 'atlas-vtt:yassify';

/** Obsidian's own theme, which Atlas' looks are drawn over. */
const DEFAULT_THEME = '';

const byApp = new WeakMap<App, LookService>();

const isLookChoice = (value: unknown): value is LookChoice => value === 'own' || isAtlasLook(value);
const isIvyColour = (value: unknown): value is string =>
  typeof value === 'string' && (value === NATURAL_IVY || /^#[0-9a-f]{6}$/i.test(value));

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

  /** The app's service while Atlas runs, for what draws by the look without making one (the canvas' bows). */
  static existing(app: App): LookService | null {
    return byApp.get(app) ?? null;
  }

  /** Forgets the app's service, whose settings go with the plugin that unloads. */
  static release(app: App): void {
    byApp.get(app)?.listeners.clear();
    byApp.delete(app);
  }

  private choice: LookChoice;
  private ivy: string;
  private yassified: boolean;
  private readonly listeners = new Set<() => void>();

  private constructor(private readonly app: App, private readonly settings: SettingsService) {
    this.choice = this.load(LOOK_STORAGE_KEY, isLookChoice) ?? 'own';
    const ivy = this.load(IVY_COLOUR_STORAGE_KEY, isIvyColour);
    this.ivy = ivy && ivy !== NATURAL_IVY ? ivy.toLowerCase() : '';
    this.yassified = this.load(YASSIFY_STORAGE_KEY, (value): value is string => value === 'on') === 'on';
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

  /** The colour the Medieval look paints its ivy in, `#rrggbb`; `''` while it keeps its own greens. */
  ivyColour(): string {
    return this.ivy;
  }

  /** Paints the Medieval look's ivy in `hex` (`#rrggbb`) on this device, or gives it its own greens back with `''`. */
  setIvyColour(hex: string): void {
    const colour = hex.toLowerCase();
    if (colour === this.ivy || (colour !== '' && !isIvyColour(colour))) return;
    this.ivy = colour;
    this.save(IVY_COLOUR_STORAGE_KEY, colour || NATURAL_IVY);
    this.notify();
  }

  /** Whether every token on the map wears a bow, on this device. */
  yassify(): boolean {
    return this.yassified;
  }

  setYassify(on: boolean): void {
    if (on === this.yassified) return;
    this.yassified = on;
    this.save(YASSIFY_STORAGE_KEY, on ? 'on' : 'off');
    this.notify();
  }

  /** Calls `listener` whenever the look, its ivy colour or Yassify changes. */
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

  /** Calls `listener` whenever Obsidian announces a theme switch (`css-change`), which may change the GM's own theme. */
  onThemeChange(listener: () => void): () => void {
    const ref = this.app.workspace.on('css-change', listener);
    return () => this.app.workspace.offref(ref);
  }

  /**
   * At start: an Atlas look whose default theme was replaced while Atlas was off (another device's sync, the GM in
   * Obsidian's settings) gives way to the GM's own theme, which is also where a device that never chose a look starts.
   */
  reconcileAtStart(): void {
    if (isAtlasLook(this.choice) && this.theme() !== DEFAULT_THEME) this.choose('own');
  }

  /** Obsidian announces a theme switch as `css-change`: a theme picked while an Atlas look is on is the GM's own look. */
  followThemeChange(): void {
    if (isAtlasLook(this.choice) && this.theme() !== DEFAULT_THEME) this.choose('own');
  }

  /**
   * Puts the GM's theme back when Atlas is disabled, not when it only unloads (a reload, an update, Obsidian quitting).
   * Obsidian takes a plugin out of `enabledPlugins` before it unloads it (`disablePluginAndSave`). Restricted mode
   * (`setEnable(false)`) unloads every plugin without touching `enabledPlugins`, so it keeps Obsidian's default theme.
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
    this.notify();
  }

  private notify(): void {
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
