import type { App } from 'obsidian';

/** The address a portrait's image is shown from: a URL as it is, a vault path as its resource URL; null for none. */
export function portraitSrc(app: App, imagePath: string): string | null {
  if (!imagePath) return null;
  return /^(?:https?:|data:|blob:|app:)/.test(imagePath) ? imagePath : app.vault.adapter.getResourcePath(imagePath);
}
