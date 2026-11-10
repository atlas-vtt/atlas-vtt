/**
 * A template editor closed with unsaved changes (its tab closed, or showed
 * another file): Obsidian lets no tab refuse to close, so the view hands its
 * hold on the session over here and the draft lives on until the question
 * is answered. Every way the question goes lets go of the hold at the end,
 * Atlas unloading too (it removes hosted dialogs, and drops every session).
 */

import React, { useEffect } from 'react';
import type { App } from 'obsidian';
import { TemplateLibrary } from '../../../library/TemplateLibrary';
import type { TemplateSession } from '../../../library/TemplateSession';
import { showHostedDialog } from '../../hostedDialog';
import { nameTakenIn } from './saveChoice';
import { saveTemplate } from './saveTemplate';
import { UnsavedChangesDialog } from './UnsavedChangesDialog';

export interface ClosedEditor {
  /** The note the editor was opened from, which a built-in's new template is given. */
  fromNote: string | null;
  /** Opens the editor again on the session's template; it takes its own hold before this one goes. */
  reopen: () => Promise<void>;
}

function ClosedTemplatePrompt({ app, session, closed, doc, close }: {
  app: App; session: TemplateSession; closed: ClosedEditor; doc: Document; close: () => void;
}): React.JSX.Element {
  // The hold goes with the question, however it leaves.
  useEffect(() => () => session.release(), [session]);
  const snapshot = session.getSnapshot();
  return (
    <UnsavedChangesDialog
      anchor={doc.body}
      subject={snapshot}
      taken={nameTakenIn(TemplateLibrary.forApp(app).list(), snapshot.id, app)}
      onSave={async (request) => {
        const outcome = await saveTemplate(app, session, request, closed.fromNote);
        return outcome.ok ? null : outcome.problem;
      }}
      onKeepEditing={() => { void closed.reopen().finally(close); }}
      onDone={close}
    />
  );
}

/**
 * Asks about the unsaved changes of an editor that closed, once its window
 * settled; nothing is asked when another view holds the template meanwhile
 * (its changes are in front of the user there) or Atlas unloaded.
 */
export function askToSaveClosed(app: App, session: TemplateSession, closed: ClosedEditor): void {
  window.setTimeout(() => {
    if (!session.alone || !session.getSnapshot().dirty) {
      session.release();
      return;
    }
    const doc = activeDocument;
    showHostedDialog(doc, 'atlas-te-unsaved-host', (close) => (
      <ClosedTemplatePrompt key="unsaved" app={app} session={session} closed={closed} doc={doc} close={close} />
    ));
  }, 0);
}
