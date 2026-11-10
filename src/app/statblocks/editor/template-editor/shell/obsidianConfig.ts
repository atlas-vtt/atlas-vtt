/**
 * Obsidian's editor setting the template editor's note column follows, so it
 * reads as the user's notes do. `vault.getConfig` is not part of Obsidian's
 * published API: it is read defensively, and where it is missing Obsidian's
 * own default stands in (on).
 */

import type { App } from 'obsidian';

interface ConfigReader {
  getConfig?: (key: string) => unknown;
}

function configFlag(app: App | undefined, key: string): boolean {
  const vault = app?.vault as ConfigReader | undefined;
  const value = typeof vault?.getConfig === 'function' ? vault.getConfig(key) : undefined;
  return typeof value === 'boolean' ? value : true;
}

/** "Readable line length" in Obsidian's editor settings. */
export function readableLineOn(app: App | undefined): boolean {
  return configFlag(app, 'readableLineLength');
}
