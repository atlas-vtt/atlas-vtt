import React, { useRef } from 'react';
import { FileText } from 'lucide-react';
import type { App } from 'obsidian';
import { Button } from '../../../../packages/components/primitives/button';
import { cn } from '../../../../../utils/cn';
import { runInBackground } from '../../../../utils/backgroundTask';
import { startTemplateBody } from '../../../library/templateBodyNotes';
import { useTemplateEditor } from '../editorContext';
import { BODY_PLACEHOLDER, START_FROM_NOTE } from './bodyTexts';
import { DraftBodyEditor } from './DraftBodyEditor';
import { readableLineOn } from './obsidianConfig';
import { chooseNoteToStartFrom } from './startFromNote';
import { useHostedNote, useTemplateBodyFile } from './useTemplateBodyNote';
import { t } from '../../../../i18n';
import './template-body.scss';

export { BODY_PLACEHOLDER } from './bodyTexts';
/** The empty note's placeholder, which the stylesheet draws: a CSS string. */
const PLACEHOLDER_STYLE = { '--atlas-te-note-placeholder': JSON.stringify(BODY_PLACEHOLDER) } as React.CSSProperties;
/** Marks the hosted note: every key pressed in it is the note's. */
export const HOSTED_NOTE_ATTRIBUTE = 'data-te-hosted-note';

export interface TemplateBodyColumnProps {
  app: App | undefined;
  /** The column's text box, whose readable line the panel's default width follows. */
  previewRef: React.RefObject<HTMLDivElement | null>;
  /** What stands over the note while it is open (the template as JSON); the note keeps its place under it. */
  cover?: React.ReactNode;
  /** The text of a template just made takes the cursor as it shows, so typing starts at once. */
  focusText?: boolean | undefined;
}

/**
 * The note column of the template editor (§2.2): the note beside the template
 * file, whose text every new statblock of the template starts with, in
 * Obsidian's own editor with the note view's width and margins, so the card
 * stands where a note view's does. It saves as it is typed, like any note.
 * A template without its note offers to start one. A template without a file
 * (never saved, or a built-in) has no note until it is saved: its text is
 * typed at once in a text box in the note's place, and its save writes it
 * into the note. An empty text offers to start from a note of the vault.
 */
export function TemplateBodyColumn({ app, previewRef, cover, focusText = false }: TemplateBodyColumnProps): React.JSX.Element {
  const { snapshot, session } = useTemplateEditor();
  const file = useTemplateBodyFile(app, snapshot.id, snapshot.path);
  const hostRef = useRef<HTMLDivElement>(null);
  const focusOnShow = useRef(false);
  useHostedNote(app, file, hostRef, focusOnShow);
  const templatePath = snapshot.path;
  const fromNote = app && !snapshot.readOnly ? (): void => chooseNoteToStartFrom(app, session) : undefined;

  const start = (): void => {
    if (!app || templatePath === null) return;
    focusOnShow.current = true;
    runInBackground(startTemplateBody(app, templatePath), 'Starting the template\'s note', t('templateEditor.noteFailed'));
  };

  const content = (): React.ReactNode => {
    if (file) return <div ref={hostRef} className="atlas-te-note__host" style={PLACEHOLDER_STYLE} {...{ [HOSTED_NOTE_ATTRIBUTE]: '' }} />;
    if (templatePath === null) {
      return (
        <>
          <DraftBodyEditor
            text={snapshot.draftBody}
            readOnly={snapshot.readOnly}
            onChange={(text) => session.setDraftBody(text)}
            focusOnShow={focusText}
          />
          {snapshot.draftBody === '' && fromNote && <StartFromNoteHint onChoose={fromNote} />}
        </>
      );
    }
    return (
      <>
        <button type="button" className="atlas-te-note__stand-in atlas-te-note__start" onClick={start}>
          <span className="atlas-te-note__line">{BODY_PLACEHOLDER}</span>
        </button>
        {fromNote && <StartFromNoteHint onChoose={fromNote} />}
      </>
    );
  };

  return (
    <div className="atlas-te-note" data-te-region="note" data-covered={cover ? '' : undefined}>
      <div ref={previewRef} className={cn('atlas-te-note__editor', readableLineOn(app) && 'is-readable-line-width')}>
        {content()}
      </div>
      {cover}
    </div>
  );
}

/**
 * "Start from a note…" under the placeholder of an empty text: a layer over
 * the column that takes no press but the button's, so a press anywhere else
 * still lands in the text. The placeholder is repeated unseen above it, so the
 * button stands under the placeholder however that wraps.
 */
function StartFromNoteHint({ onChoose }: { onChoose: () => void }): React.JSX.Element {
  return (
    <div className="atlas-te-note__empty">
      <span className="atlas-te-note__line atlas-te-note__spacer" aria-hidden="true">{BODY_PLACEHOLDER}</span>
      <span className="atlas-te-note__line">
        <Button type="button" variant="ghost" className="atlas-te-note__from-note" onClick={onChoose}>
          <FileText aria-hidden="true" />
          {START_FROM_NOTE}
        </Button>
      </span>
    </div>
  );
}
