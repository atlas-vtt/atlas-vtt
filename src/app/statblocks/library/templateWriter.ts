/**
 * Writing template files (§8.7). A session's save is a compare-and-swap: it
 * lands only while the file still holds what the session last loaded or
 * wrote, so nobody's change is overwritten unseen.
 */

import type { App } from 'obsidian';
import { ensureFolder } from '../../plugin/vaultFolders';
import { serializeTemplate } from '../format/templateFormat';
import { newTemplateId } from '../model/templateIds';
import type { StatblockTemplate, TemplateId } from '../model/templateTypes';
import type { TemplateLibrary } from './TemplateLibrary';
import { TEMPLATE_FOLDER, freeTemplatePath } from './templatePaths';

export type WriteOutcome =
  | { kind: 'written' }
  /** The file no longer holds the base: someone else changed it. `text` is what it holds. */
  | { kind: 'changed'; text: string }
  | { kind: 'missing' }
  | { kind: 'failed'; problem: string };

/** One write a session asks for: the draft, its text, and the text the file must still hold. */
export interface PendingWrite {
  path: string;
  baseText: string;
  text: string;
  template: StatblockTemplate;
}

/** An error as the plain sentence a status line shows. */
export function problemOf(error: unknown): string {
  return error instanceof Error && error.message ? error.message : String(error);
}

/** Writes `write.text` only while the file holds `write.baseText`, and tells the library; never throws. */
export async function writeTemplateText(app: App, library: TemplateLibrary, write: PendingWrite): Promise<WriteOutcome> {
  const file = app.vault.getFileByPath(write.path);
  if (!file) return { kind: 'missing' };
  try {
    // Read first, so a refused write does not touch the file at all.
    const disk = await app.vault.read(file);
    if (disk !== write.baseText) return { kind: 'changed', text: disk };
    let found = disk;
    await app.vault.process(file, (current) => {
      found = current;
      return current === write.baseText ? write.text : current;
    });
    if (found !== write.baseText) return { kind: 'changed', text: found };
    // A file renamed meanwhile is read at its new place when the vault reports the write.
    if (file.path === write.path) library.recordWrite(write.path, write.text);
    return { kind: 'written' };
  } catch (error) {
    return { kind: 'failed', problem: problemOf(error) };
  }
}

/** A file Atlas wrote: where, and the text it holds. */
export interface WrittenFile {
  path: string;
  text: string;
}

/**
 * Creates a template file at a free path in `folder` (made when missing) and
 * tells the library. Sessions pass the library they were opened with, so a
 * write that ends after the plugin unloaded never makes a new one.
 */
export async function writeNewTemplateFile(
  app: App, library: TemplateLibrary, folder: string, name: string, template: StatblockTemplate,
): Promise<WrittenFile> {
  if (folder) await ensureFolder(app, folder);
  const path = freeTemplatePath(app, folder, name);
  const text = serializeTemplate(template);
  await app.vault.create(path, text);
  library.recordWrite(path, text);
  return { path, text };
}

/** A new template, under an id no template of the library holds, in a file of its own in `folder`. */
export async function newTemplateFile(
  app: App, library: TemplateLibrary, name: string, template: StatblockTemplate, folder: string = TEMPLATE_FOLDER,
): Promise<{ id: TemplateId; path: string }> {
  let id = newTemplateId(name);
  while (library.get(id)) id = newTemplateId(name);
  const { path } = await writeNewTemplateFile(app, library, folder, name, { ...template, id });
  return { id, path };
}
