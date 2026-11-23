import type { App } from 'obsidian';

/** Atlas' companion add-ons, each listed in Obsidian's community directory. */
export type CompanionId = 'sidebar' | 'theme';

const SIDEBAR_PLUGIN_ID = 'atlas-sidebar';
/** The theme's name in its manifest, which is how Obsidian knows themes. */
const THEME_NAME = 'Atlas VTT';

/** Obsidian's own page of the add-on, where the GM installs it: Atlas never installs anything itself. */
export const COMPANION_URLS: Record<CompanionId, string> = {
  sidebar: `obsidian://show-plugin?id=${SIDEBAR_PLUGIN_ID}`,
  theme: `obsidian://show-theme?name=${encodeURIComponent(THEME_NAME)}`,
};

/** Whether the add-on is in use: the plugin enabled, the theme the active one. */
export function companionInUse(app: App, id: CompanionId): boolean {
  if (id === 'sidebar') return app.plugins?.enabledPlugins.has(SIDEBAR_PLUGIN_ID) ?? false;
  return app.customCss?.theme === THEME_NAME;
}
