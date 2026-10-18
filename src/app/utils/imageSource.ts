import { TFile, type App } from 'obsidian';

/** Image references a browser shows as they are: web addresses, and the data, blob and resource URLs Atlas makes itself. */
const URL_SCHEME = /^(?:https?|data|blob|app):/i;
/** Image references that name art on the web, which no vault file backs. */
const WEB_ADDRESS = /^https?:/i;

/** Whether an image reference is a URL rather than a vault path. */
export function isImageUrl(path: string | null | undefined): boolean {
  return typeof path === 'string' && URL_SCHEME.test(path);
}

/**
 * Whether an image reference is a web address. Such art is loaded from the
 * address when shown and never copied into the vault: it has no file to read,
 * move, trash, bundle or make a thumbnail of.
 */
export function isWebImage(path: string | null | undefined): boolean {
  return typeof path === 'string' && WEB_ADDRESS.test(path);
}

/**
 * What an `<img>` or a CSS background can show for an image reference: a URL
 * as it is, a vault file through the vault, or '' where the vault holds no
 * such file.
 */
export function imageSrc(app: App, path: string | null | undefined): string {
  if (!path) return '';
  if (isImageUrl(path)) return path;
  const file = app.vault.getAbstractFileByPath(path);
  return file instanceof TFile ? app.vault.getResourcePath(file) : '';
}
