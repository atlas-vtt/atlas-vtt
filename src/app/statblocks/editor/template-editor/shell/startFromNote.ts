/**
 * "Start from a note…": the text of a note already in the vault becomes the
 * text new statblocks of the template start with. It is copied, never
 * linked: the template's text stays its own, and the note stays the note.
 * Only what the note holds below its properties is taken, since every new
 * statblock writes properties of its own above it.
 */

import type { App } from 'obsidian';
import { confirmAction } from '../../../../ui/confirmDialog';
import { showNotice } from '../../../../ui/notice';
import { runInBackground } from '../../../../utils/backgroundTask';
import { noteName } from '../../../../utils/pathUtils';
import { readTemplateBody, replaceTemplateBody } from '../../../library/templateBodyNotes';
import { templateBodyPath } from '../../../library/templatePaths';
import { noteBodyAt } from '../../gallery/statblockNotes';
import type { EditorSession } from '../sessionTypes';
import { NoteTextModal } from './NoteTextModal';
import { t } from '../../../../i18n';

type TextSession = Pick<EditorSession, 'getSnapshot' | 'setDraftBody'>;

/** The template's text as it is now: typed for a template without a file, else its note's. */
function currentText(app: App, session: TextSession): Promise<string> {
  const snapshot = session.getSnapshot();
  return snapshot.path === null ? Promise.resolve(snapshot.draftBody) : readTemplateBody(app, snapshot.path);
}

/**
 * Puts the text of the note at `notePath` in place of the template's text,
 * asking first where the template has text of its own. Resolves whether it did.
 */
export async function startFromNote(app: App, session: TextSession, notePath: string): Promise<boolean> {
  const name = noteName(notePath);
  const text = await noteBodyAt(app, notePath);
  if (text === '') {
    showNotice(t('templateEditor.fromNote.empty', { name }));
    return false;
  }
  if ((await currentText(app, session)).trim() !== '') {
    const replace = await confirmAction({
      title: t('templateEditor.fromNote.title'),
      message: [t('templateEditor.fromNote.message', { name })],
      confirmLabel: t('templateEditor.fromNote.replace'),
      destructive: true,
    });
    if (!replace) return false;
  }
  const { path, readOnly } = session.getSnapshot();
  if (readOnly) return false;
  if (path === null) session.setDraftBody(text);
  else await replaceTemplateBody(app, path, text);
  return true;
}

/** Opens Obsidian's note search; the note chosen starts the template's text. */
export function chooseNoteToStartFrom(app: App, session: TextSession): void {
  const { path } = session.getSnapshot();
  new NoteTextModal(app, path === null ? null : templateBodyPath(path), (file) => {
    runInBackground(startFromNote(app, session, file.path), 'Starting the template\'s text from a note', t('templateEditor.fromNote.failed'));
  }).open();
}
