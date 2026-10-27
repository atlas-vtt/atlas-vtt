/**
 * Creating a native statblock note (§7.3): `statblock: true`, its template, its name and, for a
 * token, the token's art, with the text of the template's note below (the statblock shows beside
 * the note); then the token linked to it.
 */

import { normalizePath, type App, type TFile, type TFolder } from 'obsidian';
import { freeNotePath, isRootPath } from '../../utils/notePaths';
import { ensureFolder } from '../../plugin/vaultFolders';
import { TokenStatblockLinkService } from '../../services/TokenStatblockLinkService';
import { INVALID_NAME_CHARACTERS } from '../../services/assetPaths';
import { TemplateLibrary } from '../library/TemplateLibrary';
import { readTemplateBody } from '../library/templateBodyNotes';
import type { FieldValue, TemplateId } from '../model/templateTypes';
import { libraryLoaded } from '../resolve/readStatblock';
import { applyFrontmatterPatches } from './frontmatterPatch';
import type { NotePatch } from './patchTypes';
import { TEMPLATE_KEY } from './statblockSource';

export interface NewStatblockNote {
  name: string;
  templateId: TemplateId;
  /** Vault folder for the note (the role's folder); Obsidian's folder for new notes when absent. */
  folder?: string | undefined;
  /** The token the statblock is for: its art becomes the note's `image`, and the token is linked to the note. */
  tokenImagePath?: string | undefined;
  /** Values the statblock starts with (a fence copied into a native note); the markers, `name` and a token's `image` win. */
  values?: Readonly<Record<string, FieldValue>> | undefined;
  /** The Markdown below the frontmatter; the text in the template's note where not given. */
  body?: string | undefined;
}

export interface CreatedStatblockNote {
  file: TFile;
  /** Whether the token was linked; false without a token. */
  linked: boolean;
}

const FALLBACK_NAME = 'New statblock';

/** Creates the note and links the token to it. Throws when the note cannot be created. */
export async function createStatblockNote(app: App, note: NewStatblockNote): Promise<CreatedStatblockNote> {
  const folder = await targetFolder(app, note.folder);
  const path = freeNotePath(app, folder, noteFileName(note.name));
  const body = note.body ?? await savedTemplateBody(app, note.templateId);
  const file = await app.vault.create(path, statblockNoteText({ ...note, name: shownName(note.name, path), body }));
  const linked = note.tokenImagePath === undefined
    ? false
    : await TokenStatblockLinkService.getInstance(app).linkTokenToStatblock(note.tokenImagePath, file.path);
  return { file, linked };
}

/**
 * The name the statblock starts with: the one asked for, except that an unnamed
 * statblock takes its file's name ("New statblock 3"), so note and card agree.
 */
export function shownName(asked: string, path: string): string {
  const name = asked.trim();
  if (name && name !== FALLBACK_NAME) return name;
  const base = path.split('/').pop() ?? '';
  return base.replace(/\.md$/i, '') || FALLBACK_NAME;
}

/** The folder named, created when missing, or Obsidian's folder for new notes. */
async function targetFolder(app: App, folder: string | undefined): Promise<TFolder> {
  if (folder === undefined) return app.fileManager.getNewFileParent('');
  const path = normalizePath(folder);
  return isRootPath(path) ? app.vault.getRoot() : ensureFolder(app, path);
}

/**
 * The text a template gives its new statblocks: what its note holds, as it
 * is typed (the note saves itself); empty for a built-in or a template
 * without a note.
 */
export async function savedTemplateBody(app: App, templateId: TemplateId): Promise<string> {
  const library = TemplateLibrary.forApp(app);
  await libraryLoaded(library);
  return readTemplateBody(app, library.get(templateId)?.path ?? null);
}

/** The text of a new statblock note: its frontmatter, written by the patcher, then its body. */
export function statblockNoteText(note: Pick<NewStatblockNote, 'name' | 'templateId' | 'tokenImagePath' | 'values' | 'body'>): string {
  const set = (key: string, next: FieldValue): NotePatch => ({ op: 'set', path: [key], base: undefined, next });
  const own = ['statblock', TEMPLATE_KEY, 'name', ...(note.tokenImagePath ? ['image'] : [])];
  const patches = [
    set('statblock', true),
    set(TEMPLATE_KEY, note.templateId),
    set('name', note.name.trim() || FALLBACK_NAME),
    ...(note.tokenImagePath ? [set('image', note.tokenImagePath)] : []),
    ...Object.entries(note.values ?? {}).filter(([key]) => !own.includes(key)).map(([key, value]) => set(key, value)),
  ];
  const result = applyFrontmatterPatches('', patches);
  if (result.conflicts.length > 0) throw new Error('The statblock note could not be written.');
  return result.text + (note.body ?? '');
}

/** A note name a file can carry: characters Obsidian rejects or that break links become `-`. */
export function noteFileName(name: string): string {
  const cleaned = name.trim().replace(new RegExp(INVALID_NAME_CHARACTERS.source, 'g'), '-').replace(/^\.+/, '').trim();
  return cleaned || FALLBACK_NAME;
}
