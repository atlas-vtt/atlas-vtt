/**
 * Saving a template from the editor: Update writes the draft over the
 * template's file; Save as new writes it as a template of its own, with a
 * copy of the original's note (a template without a file writes the text
 * typed for it, or the text it was made with), and drops the draft from the original, which stays as it was.
 * The note itself saves as it is typed, like any note: Update leaves it alone. A note on a built-in
 * that the editor was opened from switches to the new template, and a
 * template made from the gallery for a role starts that role's statblocks.
 */

import { type App } from 'obsidian';
import { showNotice } from '../../../../ui/notice';
import { copiedFrom, createTemplateFile } from '../../../library/templateActions';
import { readTemplateBody } from '../../../library/templateBodyNotes';
import { TemplateLibrary } from '../../../library/TemplateLibrary';
import type { TemplateSession } from '../../../library/TemplateSession';
import { problemOf } from '../../../library/templateWriter';
import type { StatblockTemplate, TemplateId } from '../../../model/templateTypes';
import { NoteFieldWriter } from '../../../notes/NoteFieldWriter';
import { TEMPLATE_KEY } from '../../../notes/statblockSource';
import { noteName } from '../../../../utils/pathUtils';
import { assignRoleTemplate } from '../../gallery/galleryActions';
import type { SessionSnapshot } from '../sessionTypes';
import { nameTakenIn, saveChoice, type SaveRequest } from './saveChoice';
import { t } from '../../../../i18n';

/** A template saved as new: what opens it. */
export interface SavedTemplate {
  id: TemplateId;
  path: string;
}

export type SaveOutcome = { ok: true; made: SavedTemplate | null } | { ok: false; problem: string };

/** The draft as a template of its own: where it came from, as `copyTemplate` records it. */
function asNewTemplate(snapshot: SessionSnapshot): StatblockTemplate {
  return snapshot.unsaved ? snapshot.template : { ...snapshot.template, derivedFrom: copiedFrom(snapshot.id) };
}

/** What the new template's note starts with: the text typed for a template without a file, else a copy of the saved template's note. */
function bodyOfNew(app: App, snapshot: SessionSnapshot): Promise<string> {
  return snapshot.path === null ? Promise.resolve(snapshot.draftBody) : readTemplateBody(app, snapshot.path);
}

/** The note on the built-in names the new template instead (compare-and-swap: a note changed meanwhile keeps its own). */
async function switchNote(app: App, path: string, from: TemplateId, to: TemplateId, name: string): Promise<void> {
  const outcome = await NoteFieldWriter.forApp(app).write(path, [{ op: 'set', path: [TEMPLATE_KEY], base: from, next: to }]);
  if (outcome.problem === null && outcome.conflicts.length === 0 && outcome.applied.length > 0) showNotice(`${noteName(path)} uses ${name} now.`);
}

async function saveAsNew(app: App, session: TemplateSession, name: string, fromNote: string | null): Promise<SaveOutcome> {
  const snapshot = session.getSnapshot();
  const library = TemplateLibrary.forApp(app);
  const choice = saveChoice(snapshot, name, nameTakenIn(library.list(), snapshot.id, app));
  if (choice.problem) return { ok: false, problem: choice.problem };
  const made = await createTemplateFile(app, name.trim(), asNewTemplate(snapshot), await bodyOfNew(app, snapshot));
  if (snapshot.builtIn && fromNote) await switchNote(app, fromNote, snapshot.id, made.id, name.trim());
  const role = session.roleOnSave;
  if (role) await assignRoleTemplate(app, role.collectionId, role.roleId, made.id);
  session.discard();
  return { ok: true, made };
}

/** Saves as asked; never throws. */
export async function saveTemplate(app: App, session: TemplateSession, request: SaveRequest, fromNote: string | null): Promise<SaveOutcome> {
  try {
    if (request.kind === 'new') return await saveAsNew(app, session, request.name, fromNote);
    const result = await session.save();
    return result.ok ? { ok: true, made: null } : result;
  } catch (error) {
    console.error('[Atlas] Saving the template failed:', error);
    return { ok: false, problem: t('templateEditor.save.failedWhy', { problem: problemOf(error) }) };
  }
}
