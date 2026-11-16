/**
 * Opening the template editor (§4.6, §7.4, §8.4): in its own tab, in the tab
 * it already has for that template, or in a note's own leaf ("Edit template"
 * from a note). A template made from the gallery opens unsaved, to be named
 * by its first save. Every way in is behind the `statblockEditor`
 * experimental switch.
 */

import { type App, type WorkspaceLeaf } from 'obsidian';
import { showNotice } from '../../ui/notice';
import { experimentalFeatureOn } from '../../experimental/experimentalFeatures';
import { TemplateLibrary } from '../library/TemplateLibrary';
import { TemplateSession, type RoleOnSave } from '../library/TemplateSession';
import { isBuiltInTemplateId, type StatblockTemplate, type TemplateId } from '../model/templateTypes';
import { TEMPLATE_EDITOR_VIEW_TYPE, readTemplateEditorState, type TemplateEditorEphemeral } from './templateEditorState';
import { t } from '../../i18n';

export interface OpenTemplateEditorOptions {
  templateId: TemplateId;
  /** The template's file, where the library may not have read it yet (a copy made a moment ago). */
  path?: string | null | undefined;
  /** An open template that was never saved: `templateId` names its session. */
  unsaved?: boolean | undefined;
  /** The collection context (§7.1). */
  collectionId?: string | null | undefined;
  /** A block to select once the editor shows. */
  select?: string | undefined;
  /** The leaf to open in; a new tab (or the template's own) when unset. */
  leaf?: WorkspaceLeaf | undefined;
  /** The statblock note "Edit template" came from (§8.4). */
  fromNote?: string | null | undefined;
}

/** The leaf already editing the template, in any window. */
function editorLeafFor(app: App, id: TemplateId, path: string | null): WorkspaceLeaf | null {
  const leaves: WorkspaceLeaf[] = [];
  // A callback that returns a value stops Obsidian's iteration, so the body is a block.
  app.workspace.iterateAllLeaves((leaf) => {
    leaves.push(leaf);
  });
  return leaves.find((leaf) => {
    const view = leaf.getViewState();
    if (view.type !== TEMPLATE_EDITOR_VIEW_TYPE) return false;
    const state = view.state ?? {};
    if (path) return state.file === path;
    const read = readTemplateEditorState(state);
    return read.templateId === id || read.draftId === id;
  }) ?? null;
}

function viewState(id: TemplateId, path: string | null, unsaved: boolean): Record<string, unknown> {
  if (path) return { file: path };
  return unsaved ? { draftId: id } : { templateId: id };
}

/** Opens the template editor on a template; resolves with its leaf, or null when it did not open. */
export async function openTemplateEditor(app: App, options: OpenTemplateEditorOptions): Promise<WorkspaceLeaf | null> {
  if (!experimentalFeatureOn(app, 'statblockEditor')) return null;
  const id = options.templateId;
  const unsaved = options.unsaved === true;
  const path = isBuiltInTemplateId(id) || unsaved ? null : options.path ?? TemplateLibrary.forApp(app).get(id)?.path ?? null;
  if (!isBuiltInTemplateId(id) && !unsaved && !path) {
    showNotice(t('statblockEditor.templateNotFoundNotice'));
    return null;
  }
  const leaf = options.leaf ?? editorLeafFor(app, id, path) ?? app.workspace.getLeaf('tab');
  const state = { ...viewState(id, path, unsaved), collectionId: options.collectionId ?? null, fromNote: options.fromNote ?? null };
  const ephemeral: TemplateEditorEphemeral = options.select ? { select: options.select } : {};
  await leaf.setViewState({ type: TEMPLATE_EDITOR_VIEW_TYPE, state, active: true }, ephemeral);
  app.workspace.setActiveLeaf(leaf, { focus: true });
  return leaf;
}

export interface NewTemplateOptions {
  template: StatblockTemplate;
  /** What the template is called until its first save names it. */
  name: string;
  collectionId?: string | null | undefined;
  /** The role of the collection its first save gives it ("Use for" in the gallery). */
  role?: RoleOnSave | null | undefined;
  /** The text its first save writes into the note beside it. */
  body?: string | undefined;
  select?: string | undefined;
}

/**
 * Opens the template editor on a template that is not saved yet: nothing is
 * written until its first Save, which asks for its name. The editor's view
 * holds the session; the hold taken here only bridges the opening.
 */
export async function openNewTemplate(app: App, options: NewTemplateOptions): Promise<WorkspaceLeaf | null> {
  if (!experimentalFeatureOn(app, 'statblockEditor')) return null;
  const session = TemplateSession.openUnsaved(app, options.template, options.name, options.role ?? null, options.body ?? '');
  try {
    return await openTemplateEditor(app, {
      templateId: session.getSnapshot().id, unsaved: true, collectionId: options.collectionId, select: options.select,
    });
  } finally {
    session.release();
  }
}
