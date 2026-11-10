import type { App } from 'obsidian';
import type { BundleFileReader } from '../../../../services/collectionBundle/bundleReader';
import type { LibraryTemplate } from '../../../../statblocks/model/resolvedTypes';
import { resourceUrl } from '../utils/assetFormatters';

/**
 * Where the transfer dialogs read token art and statblock notes: the vault
 * when exporting, the file being imported when importing.
 */
export interface ContentMedia {
  /** Renders statblocks and resolves their layouts. */
  app: App;
  /** URL of the image at a content path, or null when there is none; a promise while it is being unpacked. */
  imageUrl(path: string): string | null | Promise<string | null>;
  /** Text of a statblock note that is not in the vault yet; undefined when the vault has it. */
  noteText(path: string): Promise<string | undefined>;
  /** Templates that come with those notes (the bundle's own), found before the library's. */
  templates?: readonly LibraryTemplate[] | undefined;
  /** Releases the object URLs handed out. */
  dispose(): void;
}

export function vaultMedia(app: App): ContentMedia {
  return {
    app,
    imageUrl: (path) => resourceUrl(app, path) || null,
    noteText: () => Promise.resolve(undefined),
    dispose: () => undefined,
  };
}

/** Unpacks each image once, when a card first shows it, and keeps its URL until disposed. */
export function bundleMedia(app: App, files: BundleFileReader): ContentMedia {
  const resolved = new Map<string, string | null>();
  const pending = new Map<string, Promise<string | null>>();
  let disposed = false;
  return {
    app,
    imageUrl(path) {
      if (resolved.has(path)) return resolved.get(path)!;
      let url = pending.get(path);
      if (!url) {
        url = files.blob(path).then((blob) => {
          const next = blob && !disposed ? URL.createObjectURL(blob) : null;
          resolved.set(path, next);
          pending.delete(path);
          return next;
        });
        pending.set(path, url);
      }
      return url;
    },
    noteText: async (path) => (await files.text(path)) ?? undefined,
    templates: files.templates,
    dispose() {
      disposed = true;
      for (const url of resolved.values()) if (url) URL.revokeObjectURL(url);
      resolved.clear();
    },
  };
}
