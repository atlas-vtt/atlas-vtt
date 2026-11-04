import React, { useEffect, useState } from 'react';
import { ConflictBar } from '../ConflictBar';
import { EditorBar } from '../EditorBar';
import type { EditorSession, SessionSnapshot } from '../sessionTypes';
import { t } from '../../../../i18n';

/** A save is quiet: "Saving…" shows only once a write has taken this long. */
const SAVING_SHOWN_AFTER_MS = 1000;

/** True once `waiting` has held for `ms` without a break. */
function useAfter(waiting: boolean, ms: number): boolean {
  const [late, setLate] = useState(false);
  useEffect(() => {
    setLate(false);
    if (!waiting) return undefined;
    const timer = window.setTimeout(() => setLate(true), ms);
    return () => window.clearTimeout(timer);
  }, [waiting, ms]);
  return late;
}

export interface TemplateStateBarsProps {
  session: EditorSession;
  snapshot: SessionSnapshot;
}

/**
 * The template editor's lines above the card (§2.3), in the state-bar slot
 * where a note shows its own: a conflict with the file, and a save that
 * failed (Save tries again) or takes long. Nothing else stands here, so the
 * card starts where the note view's does.
 */
export function TemplateStateBars({ session, snapshot }: TemplateStateBarsProps): React.JSX.Element {
  const saving = useAfter(!snapshot.readOnly && snapshot.saveState === 'saving', SAVING_SHOWN_AFTER_MS);

  return (
    <>
      <ConflictBar session={session} snapshot={snapshot} />
      {snapshot.saveState === 'error' && !snapshot.readOnly && (
        <EditorBar tone="warning" text={snapshot.saveProblem ?? t('templateEditor.save.failed')} />
      )}
      {saving && <p className="atlas-te-saving" role="status">{t('templateEditor.saving')}</p>}
    </>
  );
}
