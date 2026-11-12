/**
 * Creating a statblock (§7.3), one flow for every entry point: a role of the
 * collection, then the note (`createStatblockNote`) in the role's folder with
 * the role's template (or a template picked itself, which has no folder of its
 * own), then the note opening with its statblock beside it and
 * focus on the first empty value. From a token the note is named after the token and the token linked;
 * otherwise (commands, the file menu) a popover asks for the name. Behind the
 * `statblockEditor` switch, like every entry point.
 */

import { type App } from 'obsidian';
import { showNotice } from '../../../ui/notice';
import { experimentalFeatureOn } from '../../../experimental/experimentalFeatures';
import { AssetService } from '../../../services/AssetService';
import { createStatblockNote, type CreatedStatblockNote, type NewStatblockNote } from '../../notes/createStatblockNote';
import { roleFolder } from '../../roles/collectionStatblockRoles';
import { openStatblockEditor, type StatblockEditorEntry } from '../openStatblockEditor';
import { chosenRole, collectionOffers, roleTemplateId } from './collectionRoles';
import { TemplateLibrary } from '../../library/TemplateLibrary';
import type { TemplateId } from '../../model/templateTypes';
import { libraryLoaded } from '../../resolve/readStatblock';
import { TEMPLATE_EDITOR_VIEW_TYPE, readTemplateEditorState } from '../templateEditorState';
import { promptStatblockName } from './CreationPrompt';
import { chooseTemplate } from './TemplateChoiceModal';
import type { TemplateOffer } from './templateOffers';
import { t } from '../../../i18n';

/**
 * What a statblock starts from: a role of the collection, whose folder the note goes into, with the role's template
 * unless another is named (the template of a fence's layout); or a template picked itself, which belongs to no role.
 */
type CreationStart =
  | { roleId: string; templateId?: TemplateId | undefined }
  | { roleId?: undefined; templateId: TemplateId };

export type StatblockCreation = CreationStart & {
  /** The entry point's collection; the default collection when null (a map outside every collection, a command). */
  collectionId: string | null;
  name: string;
  /** A folder the user picked (the file menu); the role's folder otherwise. */
  folder?: string | undefined;
  /** The token the statblock is for: its art goes into the note, and the token is linked to it. */
  tokenImagePath?: string | undefined;
  from: StatblockEditorEntry;
  /** Called once the token is linked, with the new note's path. */
  onLinked?: ((notePath: string) => void) | undefined;
  /** Values the statblock starts with (Copy into a new statblock). */
  values?: NewStatblockNote['values'];
};

export interface StatblockCreationRequest {
  /** The entry point's collection; the default one when it names none. */
  collectionId: string | null;
  /** A template to offer first; else the one the active template editor shows. */
  templateId?: TemplateId | undefined;
  folder?: string | undefined;
  from: StatblockEditorEntry;
}

/** Where a new statblock is made: for which collection, from which template, in which folder (Obsidian's for new notes when undefined). */
interface CreationPlace {
  collectionId: string;
  templateId: TemplateId;
  folder: string | undefined;
}

/** The place of a creation; null where it names a role and the collection has none. */
async function placeOf(app: App, creation: StatblockCreation): Promise<CreationPlace | null> {
  if (creation.roleId === undefined) {
    const collectionId = creation.collectionId ?? AssetService.getInstance(app).getDefaultCollectionId();
    return { collectionId, templateId: creation.templateId, folder: creation.folder };
  }
  const chosen = chosenRole(app, creation.collectionId, creation.roleId);
  if (!chosen) return null;
  return {
    collectionId: chosen.collectionId,
    templateId: creation.templateId ?? await roleTemplateId(app, chosen.role),
    folder: creation.folder ?? roleFolder(chosen.settings, chosen.role.id),
  };
}

/**
 * Creates the note for a chosen role or template and name, links the token, and opens the
 * note. Returns the note's path, or null when nothing was created (the switch
 * is off, or the note could not be written, which a notice says). A note whose
 * token could not be linked is kept and opened, and a notice says so.
 */
export async function createStatblock(app: App, creation: StatblockCreation): Promise<string | null> {
  if (!experimentalFeatureOn(app, 'statblockEditor')) return null;
  const place = await placeOf(app, creation);
  if (!place) return null;
  const { collectionId, templateId, folder } = place;

  let created: CreatedStatblockNote;
  try {
    created = await createStatblockNote(app, {
      name: creation.name,
      templateId,
      folder,
      tokenImagePath: creation.tokenImagePath,
      values: creation.values,
    });
  } catch (error) {
    console.error('[Atlas] Creating a statblock failed:', error);
    showNotice(t('statblockEditor.createFailed'));
    return null;
  }
  const notePath = created.file.path;
  if (created.linked) creation.onLinked?.(notePath);
  else if (creation.tokenImagePath !== undefined) showNotice(t('statblockEditor.createdNotLinked'));
  await openStatblockEditor(app, { notePath, collectionId, from: creation.from, focusFirstEmpty: true });
  return notePath;
}

/** Where the popover of a command stands: the top middle of the window, where Obsidian's prompts open. */
function promptPoint(win: Window): { x: number; y: number } {
  return { x: Math.round(win.innerWidth / 2), y: Math.round(win.innerHeight * 0.15) };
}

/** The template the active leaf's template editor shows, if it shows one: "New statblock…" offers it first. */
function editedTemplate(app: App): TemplateId | null {
  const state = app.workspace.getMostRecentLeaf?.()?.getViewState();
  if (state?.type !== TEMPLATE_EDITOR_VIEW_TYPE) return null;
  const builtIn = readTemplateEditorState(state.state).templateId;
  const file = state.state?.file;
  return builtIn ?? (typeof file === 'string' ? TemplateLibrary.forApp(app).fileAt(file)?.entry?.template.id ?? null : null);
}

/** What "New statblock…" offers for a collection, the template being edited first, once the library has read the vault. */
async function offersFor(app: App, collectionId: string, preferred: TemplateId | null): Promise<TemplateOffer[]> {
  const library = TemplateLibrary.forApp(app);
  await libraryLoaded(library);
  return collectionOffers(app, collectionId, library.list(), preferred);
}

/**
 * The flow without a token (commands, the file menu; spec §12.2): the
 * templates to start from in the middle of the window, the one the editor
 * shows first, then the name popover, then the note with its first value
 * being typed. Returns the note's path, or null when the user backed out.
 */
export async function startStatblockCreation(app: App, request: StatblockCreationRequest): Promise<string | null> {
  if (!experimentalFeatureOn(app, 'statblockEditor')) return null;
  const assets = AssetService.getInstance(app);
  const known = (await assets.getCollections()).map(({ id }) => id);
  const requested = request.collectionId;
  const collectionId = requested !== null && known.includes(requested) ? requested : assets.getDefaultCollectionId();
  const offer = await chooseTemplate(app, await offersFor(app, collectionId, request.templateId ?? editedTemplate(app)));
  if (!offer) return null;
  const doc = activeDocument;
  const name = await promptStatblockName(doc, promptPoint(doc.win), offer.label);
  if (name === null) return null;
  const settings = assets.getCollectionSettings(collectionId);
  const folder = request.folder ?? (offer.roleId ? roleFolder(settings, offer.roleId) : undefined);
  try {
    const { file } = await createStatblockNote(app, { name, templateId: offer.templateId, folder });
    await openStatblockEditor(app, { notePath: file.path, collectionId, from: request.from, focusFirstEmpty: true });
    return file.path;
  } catch (error) {
    console.error('[Atlas] Creating a statblock failed:', error);
    showNotice(t('statblockEditor.createFailed'));
    return null;
  }
}
