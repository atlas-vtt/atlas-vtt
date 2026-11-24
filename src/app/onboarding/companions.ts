import type { App } from 'obsidian';

/** Atlas' companion add-ons, each listed in Obsidian's community directory. */
export type CompanionId = 'sidebar';

const PLUGIN_IDS: Record<CompanionId, string> = { sidebar: 'atlas-sidebar' };

/** Obsidian's own page of the add-on, where the GM installs it: Atlas never installs anything itself. */
export const COMPANION_URLS: Record<CompanionId, string> = {
  sidebar: `obsidian://show-plugin?id=${PLUGIN_IDS.sidebar}`,
};

/** Whether the add-on is in use: the plugin enabled. */
export function companionInUse(app: App, id: CompanionId): boolean {
  return app.plugins?.enabledPlugins.has(PLUGIN_IDS[id]) ?? false;
}
