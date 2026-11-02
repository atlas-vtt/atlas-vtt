/**
 * What the dialogs that run a batch over notes share (the Rename key dialog, the layout import's
 * adoption): a list folded open on demand, the batch's progress, and the notes it left as they were.
 */

import React, { useId, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { Button } from '../../packages/components/primitives/button';
import { ProgressBar } from '../../packages/components/primitives/ProgressBar';
import { t } from '../../i18n';
import './batch-parts.scss';

/** A heading that folds a list open and shut. */
export function Disclosure({ label, children }: { label: string; children: React.ReactNode }): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const listId = useId();
  return (
    <div className="atlas-sb-batch__disclosure">
      <Button type="button" variant="ghost" size="sm" className="atlas-sb-batch__toggle" aria-expanded={open} aria-controls={listId} onClick={() => setOpen(!open)}>
        <ChevronRight className="atlas-sb-batch__chevron" aria-hidden="true" />
        {label}
      </Button>
      {open && <ul id={listId} className="atlas-sb-batch__list">{children}</ul>}
    </div>
  );
}

/** A list row: the note, and a word on it in the muted colour. */
export function NoteRow({ name, detail }: { name: string; detail?: React.ReactNode }): React.JSX.Element {
  return <li>{name}{detail !== undefined && <> <span className="atlas-sb-batch__detail">{detail}</span></>}</li>;
}

/** How far a batch has come: the bar (named by `label`) and `text` under it. */
export function BatchProgress({ done, total, label, text }: { done: number; total: number; label: string; text: string }): React.JSX.Element {
  return (
    <div className="atlas-sb-batch__progress" aria-live="polite">
      <ProgressBar value={done} max={total} label={label} valueText={text} />
      <p className="atlas-te-dialog__text">{text}</p>
    </div>
  );
}

/** The notes a batch left as they were: those it skipped, with why, and those Cancel kept it from. */
export function LeftNoteRows({ skipped, notReached, nameOf }: {
  skipped: ReadonlyArray<{ path: string; reason: string }>;
  notReached: readonly string[];
  nameOf: (path: string) => string;
}): React.JSX.Element {
  return (
    <>
      {skipped.map(({ path, reason }) => <NoteRow key={path} name={nameOf(path)} detail={reason} />)}
      {notReached.map((path) => <NoteRow key={path} name={nameOf(path)} detail={t('statblockEditor.notReached')} />)}
    </>
  );
}
