import type { App, Plugin } from 'obsidian';
import { inEveryDocument } from '../platform/atlasDocuments';
import type { SettingsService } from '../services/SettingsService';
import type { FogEdgeStyle } from '../fog/fogEdge';

/** The two looks of the Atlas theme: the mediaeval module page and the clean sci-fi one. */
export type AtlasLook = 'mediaeval' | 'scifi';

/** The fog's edge each look switches to: a crackled module page, a soft clean screen. */
export const LOOK_FOG_EDGE_STYLE: Record<AtlasLook, FogEdgeStyle> = { mediaeval: 'crackle', scifi: 'soft' };

/** The Atlas theme draws its Sci-fi look under this class on `body`; nothing else reads it. */
export const SCIFI_LOOK_CLASS = 'atlas-look-scifi';

/** The theme's name in its manifest, which is how Obsidian knows themes. */
export const ATLAS_THEME_NAME = 'Atlas VTT';

export function isAtlasLook(value: unknown): value is AtlasLook {
  return value === 'mediaeval' || value === 'scifi';
}

export function atlasThemeInstalled(app: App): boolean {
  return app.customCss?.themes?.[ATLAS_THEME_NAME] !== undefined;
}

export function atlasThemeActive(app: App): boolean {
  return app.customCss?.theme === ATLAS_THEME_NAME;
}

/** Makes the Atlas theme the vault's theme, as picking it under Appearance does. */
export function switchToAtlasTheme(app: App): void {
  app.customCss?.setTheme?.(ATLAS_THEME_NAME);
}

/**
 * Keeps every window's `body` in the look the settings name while the Atlas theme is in use (Obsidian announces a
 * theme switch as `css-change`), and takes the class off when Atlas unloads. A switch of look is announced as
 * `css-change` too, since what reads the theme's CSS (the ivy Atlas lends its initiative trackers) follows that.
 */
export function registerLookSync(plugin: Plugin, settings: SettingsService): void {
  const { app } = plugin;
  const scifi = (): boolean => settings.getLook() === 'scifi' && atlasThemeActive(app);
  inEveryDocument(plugin, (doc) => {
    const apply = (): void => { doc.body.toggleClass(SCIFI_LOOK_CLASS, scifi()); };
    apply();
    const stop = settings.onChange(apply);
    const css = app.workspace.on('css-change', apply);
    return () => { stop(); app.workspace.offref(css); doc.body.removeClass(SCIFI_LOOK_CLASS); };
  });
  let shown = scifi();
  plugin.register(settings.onChange(() => {
    if (scifi() === shown) return;
    shown = !shown;
    app.workspace.trigger('css-change');
  }));
}
