/**
 * Where template files go and what they are called (§4.3): the library folder
 * for new ones, the template's name as the file's basename.
 */

import { normalizePath, type App } from 'obsidian';
import { ATLAS_VTT_DIR, INVALID_NAME_CHARACTERS } from '../../services/assetPaths';
import { TEMPLATE_EXTENSION } from './templateFiles';
import { t } from '../../i18n';

/** New templates are written here; the library reads `.atlastemplate` files anywhere. */
export const TEMPLATE_FOLDER = `${ATLAS_VTT_DIR}/statblock-templates`;

const FALLBACK_NAME = 'New template';

/** Why `name` cannot name a template file, in plain words, or null when it can. */
export function templateNameProblem(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return t('templateEditor.name.empty');
  if (INVALID_NAME_CHARACTERS.test(trimmed)) return t('templateEditor.name.characters');
  if (trimmed.startsWith('.')) return t('templateEditor.name.dot');
  return null;
}

/** A name a file can carry: characters Obsidian rejects or that break links become `-`. */
export function templateFileName(name: string): string {
  const cleaned = name.trim().replace(new RegExp(INVALID_NAME_CHARACTERS.source, 'g'), '-').replace(/^\.+/, '').trim();
  return cleaned || FALLBACK_NAME;
}

/** The name a copy of a template starts with ("Marsh creature copy"); the file takes the next free name. */
export function copyName(name: string): string {
  return `${name} copy`;
}

/** The folder part of a path; '' for the vault's root. */
export function folderOf(path: string): string {
  const slash = path.lastIndexOf('/');
  return slash < 0 ? '' : path.slice(0, slash);
}

/**
 * The note beside a template file that holds the text new statblocks of the
 * template start with: `<folder>/<name>.md`.
 */
export function templateBodyPath(templatePath: string): string {
  const suffix = `.${TEMPLATE_EXTENSION}`;
  const stem = templatePath.endsWith(suffix) ? templatePath.slice(0, -suffix.length) : templatePath;
  return `${stem}.md`;
}

/** `<folder>/<name>.atlastemplate`. */
export function templatePathIn(folder: string, name: string): string {
  return normalizePath(folder ? `${folder}/${name}.${TEMPLATE_EXTENSION}` : `${name}.${TEMPLATE_EXTENSION}`);
}

/**
 * Whether a file other than `except` already has this path, in any letter
 * case: the file systems of macOS and Windows do not tell names apart by it.
 */
export function templatePathTaken(app: App, path: string, except: string | null = null): boolean {
  const lower = path.toLowerCase();
  if (except !== null && lower === except.toLowerCase()) return false;
  if (app.vault.getAbstractFileByPath(path)) return true;
  const siblings = app.vault.getFolderByPath(folderOf(path) || '/')?.children ?? [];
  return siblings.some((child) => child.path.toLowerCase() === lower);
}

/** Whether the template file or the note beside it is taken: a new template never takes over a note it did not write. */
export function templateNameTakenAt(app: App, path: string): boolean {
  return templatePathTaken(app, path) || templatePathTaken(app, templateBodyPath(path));
}

/** `<name>.atlastemplate` in the folder, else `<name> 2`, `<name> 3`, … while that or its note is taken. */
export function freeTemplatePath(app: App, folder: string, name: string): string {
  const stem = templateFileName(name);
  let path = templatePathIn(folder, stem);
  for (let n = 2; templateNameTakenAt(app, path); n++) path = templatePathIn(folder, `${stem} ${n}`);
  return path;
}
