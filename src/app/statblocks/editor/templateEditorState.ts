/** The template editor's view type and the state Obsidian saves for it in the workspace. */

import { isBuiltInTemplateId, type TemplateId } from '../model/templateTypes';

/** A `FileView` for `.atlastemplate` files; built-ins and templates never saved open in it by id, without a file. */
export const TEMPLATE_EDITOR_VIEW_TYPE = 'atlas-statblock-template';

export interface TemplateEditorState {
  /** A built-in's id. A vault template is named by its file (`state.file`, which `FileView` keeps). */
  templateId: TemplateId | null;
  /** A template made in the editor and never saved; it lives as long as the session that holds it (never across a restart). */
  draftId: TemplateId | null;
  /** The collection the editor works for (§7.1); null for the default one. */
  collectionId: string | null;
  /** The statblock note "Edit template" came from: a built-in saved as a new template from there is given to it. */
  fromNote: string | null;
}

/** What `openTemplateEditor` asks of the view once, never saved: the block to select. */
export interface TemplateEditorEphemeral {
  select?: string | undefined;
}

const isText = (value: unknown): value is string => typeof value === 'string' && value !== '';

/** The editor's state from a saved workspace or a `setViewState` call; only a built-in's id is taken as a template id. */
export function readTemplateEditorState(state: unknown): TemplateEditorState {
  const record = state !== null && typeof state === 'object' ? state as Record<string, unknown> : {};
  const { templateId, draftId, collectionId, fromNote } = record;
  return {
    templateId: isText(templateId) && isBuiltInTemplateId(templateId) ? templateId : null,
    draftId: isText(draftId) && !isBuiltInTemplateId(draftId) ? draftId : null,
    collectionId: isText(collectionId) ? collectionId : null,
    fromNote: isText(fromNote) ? fromNote : null,
  };
}

export function readTemplateEditorEphemeral(state: unknown): TemplateEditorEphemeral {
  const record = state !== null && typeof state === 'object' ? state as Record<string, unknown> : {};
  return isText(record.select) ? { select: record.select } : {};
}
