/// <reference types="vite/client" />
import type { AtlasAddon } from './AtlasAddon';

/**
 * Every add-on folder with an `addon.ts`, found at build time. Deleting the
 * folder removes the add-on; nothing else lists it.
 */
const modules = import.meta.glob<{ default: AtlasAddon }>('../../addons/*/addon.ts', { eager: true });

const addons: readonly AtlasAddon[] = Object.values(modules)
  .map((module) => module.default)
  .filter((addon): addon is AtlasAddon => Boolean(addon?.id))
  .sort((a, b) => (a.order ?? 100) - (b.order ?? 100) || a.id.localeCompare(b.id));

export function installedAddons(): readonly AtlasAddon[] {
  return addons;
}
