import type { App, Plugin } from 'obsidian';
import { inEveryDocument } from '../platform/atlasDocuments';
import type { SettingsService } from '../services/SettingsService';

/** The two looks of the Atlas theme: the mediaeval module page and the clean sci-fi one. */
export type AtlasLook = 'mediaeval' | 'scifi';

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

/** Keeps every window's `body` in the look the settings name, and takes the class off when Atlas unloads. */
export function registerLookSync(plugin: Plugin, settings: SettingsService): void {
  inEveryDocument(plugin, (doc) => {
    const apply = (): void => { doc.body.toggleClass(SCIFI_LOOK_CLASS, settings.getLook() === 'scifi'); };
    apply();
    const stop = settings.onChange(apply);
    return () => { stop(); doc.body.removeClass(SCIFI_LOOK_CLASS); };
  });
}
