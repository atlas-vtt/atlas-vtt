import React, { useEffect, useRef } from 'react';
import { BODY_LABEL, BODY_PLACEHOLDER } from './bodyTexts';

export interface DraftBodyEditorProps {
  text: string;
  readOnly: boolean;
  onChange: (text: string) => void;
  /** Takes focus once shown, where nothing in its document is being typed in already. */
  focusOnShow: boolean;
}

/** Whether `element` takes typing: another field already has the user's keys. */
function typesText(element: Element | null): boolean {
  return element?.closest('input, textarea, select, [contenteditable="true"]') != null;
}

/**
 * The text of a template without a file (never saved, or a built-in), typed
 * at once in the note's place: the note beside the template exists only once
 * it is saved, and its save writes this text into it. A plain text box in the
 * note's font and readable line, since Obsidian lends its editor only to
 * files; the native undo takes back what was typed.
 */
export function DraftBodyEditor({ text, readOnly, onChange, focusOnShow }: DraftBodyEditorProps): React.JSX.Element {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const box = ref.current;
    if (!focusOnShow || !box || typesText(box.doc.activeElement)) return;
    box.focus({ preventScroll: true });
    // Once, as it is shown: a later render never takes focus back.
  }, []);

  return (
    <div
      className="atlas-te-note__draft"
      // A press in the margins puts the cursor in the text, as in a note.
      onMouseDown={(event) => {
        if (event.target !== event.currentTarget) return;
        event.preventDefault();
        ref.current?.focus();
      }}
    >
      <textarea
        ref={ref}
        className="atlas-te-note__draft-text"
        value={text}
        placeholder={BODY_PLACEHOLDER}
        aria-label={BODY_LABEL}
        readOnly={readOnly}
        spellCheck
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}
