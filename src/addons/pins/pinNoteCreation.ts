import { normalizePath, type App, type TFile } from 'obsidian';

/** Characters Obsidian does not allow in file names. */
const ILLEGAL_NAME_CHARS = /[\\/:*?"<>|#^[\]]/g;

/** A typed name made safe for a note file name; empty when nothing usable is left. */
export function noteFileName(typed: string): string {
  return typed.replace(ILLEGAL_NAME_CHARS, ' ').replace(/\s+/g, ' ').trim();
}

/** Creates `folder` and any missing parents. */
async function ensureFolder(app: App, folder: string): Promise<void> {
  let path = '';
  for (const part of folder.split('/')) {
    path = path ? `${path}/${part}` : part;
    if (!app.vault.getAbstractFileByPath(path)) await app.vault.createFolder(path);
  }
}

/**
 * Creates an empty note named `name` in `folder` (the pins add-on's notes
 * folder), so a pin can link to a place that has no note yet.
 */
export async function createPinNote(app: App, name: string, folder: string): Promise<TFile> {
  const target = normalizePath(folder);
  await ensureFolder(app, target);
  return app.vault.create(normalizePath(`${target}/${name}.md`), '');
}
