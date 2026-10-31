/**
 * Creating a statblock (§7.3), one flow for every entry point: a role of the
 * collection, then the note (`createStatblockNote`) in the role's folder with
 * the role's template, then the note opening with its statblock beside it and
 * focus on the first empty value. From a token the note is named after the token and the token linked;
 * otherwise (commands, the file menu) a popover asks for the name. Behind the
 * `statblockEditor` switch, like every entry point.
 */

import { type App } from 'obsidian';
import { showNotice } from '../../../ui/notice';
import { experimentalFeatureOn } from '../../../experimental/experimentalFeatures';
import { AssetService } from '../../../services/AssetService';
import { createStatblockNote, type NewStatblockNote } from '../../notes/createStatblockNote';
import { roleFolder } from '../../roles/collectionStatblockRoles';
import { openStatblockEditor, type StatblockEditorEntry } from '../openStatblockEditor';
import { chosenRole, roleChoicesFor, roleTemplateId } from './collectionRoles';
import { systemPresetsOf } from '../../../services/mapCollectionRules';
import { TemplateLibrary } from '../../library/TemplateLibrary';
import type { TemplateId } from '../../model/templateTypes';
import { libraryLoaded } from '../../resolve/readStatblock';
import { collectionStatblockRoles } from '../../roles/collectionStatblockRoles';
import { TEMPLATE_EDITOR_VIEW_TYPE, readTemplateEditorState } from '../templateEditorState';
import { promptStatblockName } from './CreationPrompt';
import { chooseTemplate } from './TemplateChoiceModal';
import { templateOffers, type TemplateOffer } from './templateOffers';
import { t } from '../../../i18n';

export interface StatblockCreation {
  /** The entry point's collection; the default collection when null (a map outside every collection, a command). */
  collectionId: string | null;
  roleId: string;
  /** The template to start from (the template of a fence's layout); the role's otherwise. */
  templateId?: TemplateId | undefined;
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
}

export interface StatblockCreationRequest {
  /** The entry point's collection; the default one when it names none. */
  collectionId: string | null;
  /** A template to offer first; else the one the active template editor shows. */
  templateId?: TemplateId | undefined;
  folder?: string | undefined;
  from: StatblockEditorEntry;
}

/**
 * Creates the note for a chosen role and name, links the token, and opens the
 * note. Returns the note's path, or null when nothing was created (the switch
 * is off, or the note could not be written, which a notice says).
 */
export async function createStatblock(app: App, creation: StatblockCreation): Promise<string | null> {
  if (!experimentalFeatureOn(app, 'statblockEditor')) return null;
  const chosen = chosenRole(app, creation.collectionId, creation.roleId);
  if (!chosen) return null;
  const { collectionId, settings, role } = chosen;

  let notePath: string;
  try {
    const { file, linked } = await createStatblockNote(app, {
      name: creation.name,
      templateId: creation.templateId ?? await roleTemplateId(app, role),
      folder: creation.folder ?? roleFolder(settings, role.id),
      tokenImagePath: creation.tokenImagePath,
      values: creation.values,
    });
    notePath = file.path;
    if (linked) creation.onLinked?.(notePath);
  } catch (error) {
    console.error('[Atlas] Creating a statblock failed:', error);
    showNotice(t('statblockEditor.createFailed'));
    return null;
  }
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

/** What "New statblock…" offers for a collection, the template being edited first. */
async function offersFor(app: App, collectionId: string, preferred: TemplateId | null): Promise<TemplateOffer[]> {
  const library = TemplateLibrary.forApp(app);
  await libraryLoaded(library);
  const assets = AssetService.getInstance(app);
  const roles = collectionStatblockRoles(assets.getCollectionSettings(collectionId), systemPresetsOf(app));
  const choices = roleChoicesFor(app, collectionId);
  return templateOffers({
    roles: await Promise.all(roles.map(async (role, index) => ({
      roleId: role.id, name: role.name, templateId: await roleTemplateId(app, role), templateName: choices[index]?.templateName ?? '',
    }))),
    templates: library.list(),
    preferred,
    changedAt: (entry) => (entry.path ? app.vault.getFileByPath(entry.path)?.stat.mtime ?? 0 : 0),
  });
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
