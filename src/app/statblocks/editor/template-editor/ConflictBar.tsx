import React, { useState } from 'react';
import type { ConflictChoice } from '../../library/TemplateSession';
import { EditorBar } from './EditorBar';
import type { EditorSession, SessionSnapshot } from './sessionTypes';
import { t } from '../../../i18n';

/**
 * What happened to the file while the editor held unsaved changes (§8.7):
 * changed elsewhere (another device, git) or deleted. The editor writes
 * nothing until one of the choices is made.
 */
export function ConflictBar({ session, snapshot }: { session: EditorSession; snapshot: SessionSnapshot }): React.JSX.Element | null {
  const [busy, setBusy] = useState(false);
  if (!snapshot.conflict) return null;

  const choose = (choice: ConflictChoice): void => {
    setBusy(true);
    void session.resolveConflict(choice).finally(() => setBusy(false));
  };
  const text = snapshot.conflict === 'deleted'
    ? t('templateEditor.conflict.deleted')
    : t('templateEditor.conflict.changed');
  const actions = snapshot.conflict === 'deleted'
    ? [
      { label: t('templateEditor.conflict.recreate'), primary: true, disabled: busy, onClick: () => choose('recreate') },
      { label: t('templateEditor.conflict.saveCopy'), disabled: busy, onClick: () => choose('save-copy') },
    ]
    : [
      { label: t('templateEditor.conflict.keepMine'), primary: true, disabled: busy, onClick: () => choose('keep-mine') },
      { label: t('templateEditor.conflict.useOther'), disabled: busy, onClick: () => choose('use-other') },
      { label: t('templateEditor.conflict.saveMineCopy'), disabled: busy, onClick: () => choose('save-copy') },
    ];

  return (
    <EditorBar tone="warning" text={text} actions={actions}>
      {snapshot.saveProblem && <p className="atlas-te-bar__detail">{snapshot.saveProblem}</p>}
    </EditorBar>
  );
}
