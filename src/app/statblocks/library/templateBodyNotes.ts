/**
 * The note beside a template (`<name>.md` next to `<name>.atlastemplate`):
 * the Markdown new statblocks of the template start with, below their
 * frontmatter. It is an ordinary note, edited in Obsidian's own editor and
 * saved as it is typed; the template's file never holds it. A template
 * without the note has an empty body. The note follows its template when
 * the template file is renamed, moved or deleted.
 */

import { TAbstractFile, TFile, type App, type EventRef } from 'obsidian';
import { runInBackground } from '../../utils/backgroundTask';
import { isTemplatePath } from './templateFiles';
import { templateBodyPath } from './templatePaths';

/** A body note open in an editor of the template editor. */
export interface OpenBodyText {
  /** What the editor holds now, which its file may not have yet (Obsidian saves after a pause). */
  read: () => string;
  /** Puts `text` in the editor in place of all it holds, as one edit its undo takes back. */
  replace: (text: string) => void;
}

const openBodies = new WeakMap<App, Map<TFile, OpenBodyText>>();

/**
 * Notes that `file` is open in an editor of the template editor; until the
 * returned function is called, reading and replacing the body go through that editor.
 */
export function noteOpenBody(app: App, file: TFile, text: OpenBodyText): () => void {
  let open = openBodies.get(app);
  if (!open) {
    open = new Map();
    openBodies.set(app, open);
  }
  const bodies = open;
  bodies.set(file, text);
  return () => {
    if (bodies.get(file) === text) bodies.delete(file);
  };
}

/** The body note of the template at `templatePath`; null where it has none. */
export function templateBodyFile(app: App, templatePath: string): TFile | null {
  return app.vault.getFileByPath(templateBodyPath(templatePath));
}

/** The editor `file` is open in, by the path it has now: Obsidian renames a file in place. */
function openBodyOf(app: App, file: TFile): OpenBodyText | undefined {
  return [...openBodies.get(app) ?? []].find(([held]) => held.path === file.path)?.[1];
}

/** The text new statblocks of the template at `templatePath` start with; empty for a template without a file or a note. */
export async function readTemplateBody(app: App, templatePath: string | null): Promise<string> {
  const file = templatePath === null ? null : templateBodyFile(app, templatePath);
  if (!file) return '';
  const open = openBodyOf(app, file);
  return open ? open.read() : app.vault.cachedRead(file);
}

/**
 * Puts `text` in the note of the template at `templatePath` in place of all
 * it holds: through its editor where the template editor shows it (one edit
 * the editor's undo takes back), else in the file, made where it has none.
 */
export async function replaceTemplateBody(app: App, templatePath: string, text: string): Promise<void> {
  const file = templateBodyFile(app, templatePath);
  if (!file) {
    await app.vault.create(templateBodyPath(templatePath), text);
    return;
  }
  const open = openBodyOf(app, file);
  if (open) open.replace(text);
  else await app.vault.process(file, () => text);
}

/** The template's note, made empty where it has none yet, for the user to write in. */
export async function startTemplateBody(app: App, templatePath: string): Promise<TFile> {
  return templateBodyFile(app, templatePath) ?? app.vault.create(templateBodyPath(templatePath), '');
}

/**
 * Writes the body note of a template just made. An empty body writes no
 * note, and a note already there is never written over.
 */
export async function writeNewTemplateBody(app: App, templatePath: string, text: string): Promise<void> {
  const path = templateBodyPath(templatePath);
  if (text === '' || app.vault.getAbstractFileByPath(path)) return;
  await app.vault.create(path, text);
}

/** A copy of one template's body note as another's, written as for a template just made. */
export async function copyTemplateBody(app: App, fromTemplatePath: string | null, toTemplatePath: string): Promise<void> {
  await writeNewTemplateBody(app, toTemplatePath, await readTemplateBody(app, fromTemplatePath));
}

/** Moves the body note along with its template, unless a note already stands at the new place. */
export async function moveTemplateBody(app: App, fromTemplatePath: string, toTemplatePath: string): Promise<void> {
  const file = templateBodyFile(app, fromTemplatePath);
  const target = templateBodyPath(toTemplatePath);
  if (!file || file.path === target || app.vault.getAbstractFileByPath(target)) return;
  await app.fileManager.renameFile(file, target);
}

/** Puts the body note of a deleted template in the trash. */
export async function trashTemplateBody(app: App, templatePath: string): Promise<void> {
  const file = templateBodyFile(app, templatePath);
  if (file) await app.fileManager.trashFile(file);
}

/**
 * Body notes follow their template file however it is renamed, moved or
 * deleted (the file explorer, Atlas, another plugin). A folder moved whole
 * takes both along, and there is nothing left to do. Returns the stop.
 */
export function followTemplateBodies(app: App): () => void {
  const { vault } = app;
  const refs: EventRef[] = [
    vault.on('rename', (file: TAbstractFile, oldPath: string) => {
      if (!(file instanceof TFile) || !isTemplatePath(file.path) || !isTemplatePath(oldPath)) return;
      runInBackground(moveTemplateBody(app, oldPath, file.path), 'Moving a template\'s note with it');
    }),
    vault.on('delete', (file: TAbstractFile) => {
      if (!(file instanceof TFile) || !isTemplatePath(file.path)) return;
      runInBackground(trashTemplateBody(app, file.path), 'Trashing a deleted template\'s note');
    }),
  ];
  return () => {
    for (const ref of refs) vault.offref(ref);
  };
}
