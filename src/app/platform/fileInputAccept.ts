import { isDesktopApp } from './desktopOnly';

/**
 * What a file input's `accept` says on this device: `accept` itself in the desktop app, where the
 * picker shows every file the list names. A tablet's picker filters by the types its system knows,
 * and an extension it has no type for is left out of the filter without a word: Android's web view
 * turns each extension into a MIME type and drops the ones it finds none for, iPadOS turns it into
 * a type identifier that no file carries unless an app declared it. A list such as
 * `image/*,.dd2vtt` then offers images and greys the map files out. So on a tablet only a list of
 * MIME types alone is kept (`image/*`, which also offers the photo library); a list that names any
 * extension (`.dd2vtt`, `.uvtt`, `.df2vtt`, `.zip`, `.ogg`, `.md`) is left out, every file can be
 * chosen, and what was chosen is told by its name, as a dropped file is.
 */
export function fileInputAccept(accept: string, desktop: boolean = isDesktopApp()): string | undefined {
  if (desktop) return accept;
  const entries = accept.split(',').map((entry) => entry.trim()).filter(Boolean);
  return entries.length > 0 && entries.every((entry) => entry.includes('/')) ? entries.join(',') : undefined;
}

/** `fileInputAccept` as the attributes of an input made with `createEl`: none where every file may be chosen. */
export function fileInputAttrs(accept: string, desktop?: boolean): { accept?: string } {
  const allowed = fileInputAccept(accept, desktop);
  return allowed === undefined ? {} : { accept: allowed };
}
