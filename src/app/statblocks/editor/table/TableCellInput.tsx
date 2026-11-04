import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CellAt } from '../../model/tableGrid';
import { hasInlineMarkup } from '../../render/shared/inlineMarkdown';

/** The text being typed in a cell, shared with the table that folds it into its next edit. */
export interface CellDraft {
  at: CellAt;
  text: string;
  /** What the cell held when typing began, or was last written: no write where the text is still this. */
  written: string;
}

/** Where the caret goes as typing begins: the whole text selected (Tab, Enter), at its end, or at a place a click named. */
export type CaretStart = 'all' | 'end' | number;

export interface TableCellInputProps {
  /** The cell as it is drawn at rest: the input's box while its text is unchanged, so nothing moves as typing starts. */
  rest: React.ReactNode;
  /** This cell's draft: the input keeps the one it started with, which the table may fold into an edit meanwhile. */
  draft: CellDraft;
  caret: CaretStart;
  label: string;
  placeholder?: string | undefined;
  /** Writes the cell's text: on leaving it, and as the input goes. */
  onCommit: (at: CellAt, text: string) => void;
  /** The table's keys (moving on, adding rows, the menu); true where the key was used. */
  onKey: (event: React.KeyboardEvent<HTMLTextAreaElement>, input: HTMLTextAreaElement) => boolean;
  /** Focus left the field for `to`. */
  onLeave: (to: EventTarget | null) => void;
  /** Registers the field's commit with the surface, to run if it closes mid-word; returns what lets it go. */
  registerPending?: ((commit: () => void) => () => void) | undefined;
  /** A paste of several values: the table fills the cells from this one on and says what this one holds now; null leaves the paste to the field. */
  onPaste: (text: string) => string | null;
}

/**
 * The text of one cell typed in its place, as Obsidian types a Live Preview
 * table's cell: a borderless field over the cell's own text, in its font,
 * wrapping as the cell wraps. Under it the cell keeps a copy of the text
 * (its rest drawing until something is typed), so the cell grows with what
 * is typed and nothing moves as typing starts. Its text is written once,
 * when it goes (the next cell, the pane closing) or is left.
 */
export function TableCellInput(props: TableCellInputProps): React.JSX.Element {
  const { rest, draft, caret, label, placeholder, onCommit, onKey, onPaste, onLeave, registerPending } = props;
  const ref = useRef<HTMLTextAreaElement>(null);
  // The draft, the caret and the surface's registry this field started with: typing starts once.
  const [mine] = useState(draft);
  const [start] = useState(caret);
  const [register] = useState(() => registerPending);
  const [text, setText] = useState(mine.text);
  const started = useRef(text);
  const commit = useRef(onCommit);
  commit.current = onCommit;

  useLayoutEffect(() => {
    const input = ref.current;
    if (!input) return;
    input.focus({ preventScroll: true });
    if (start === 'all') input.select();
    else {
      const place = start === 'end' ? input.value.length : Math.min(start, input.value.length);
      input.setSelectionRange(place, place);
    }
  }, [start]);

  const flush = useRef((): void => {
    if (mine.text === mine.written) return;
    mine.written = mine.text;
    commit.current(mine.at, mine.text);
  });

  // Going (the next cell typed, the table or pane closing), the cell writes what was typed in it.
  useEffect(() => {
    const write = flush.current;
    const release = register?.(write);
    return () => {
      release?.();
      write();
    };
  }, [register]);

  // Rest draws Markdown (a link's words): the input's box takes the text as typed instead.
  const asTyped = text !== started.current || hasInlineMarkup(text);
  return (
    <span className="atlas-sb-sheet-table__typing">
      <span className="atlas-sb-sheet-table__sizer" aria-hidden="true">{asTyped ? `${text}\u200b` : rest}</span>
      <textarea
        ref={ref}
        className="atlas-sb-sheet-table__input"
        rows={1}
        value={text}
        aria-label={label}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        onChange={(event) => {
          setText(event.target.value);
          mine.text = event.target.value;
        }}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) return;
          if (event.key === 'Escape') {
            mine.text = mine.written;
            setText(mine.written);
          }
          if (!onKey(event, event.currentTarget)) return;
          event.preventDefault();
          event.stopPropagation();
        }}
        onPaste={(event) => {
          const filled = onPaste(event.clipboardData.getData('text/plain'));
          if (filled === null) return;
          event.preventDefault();
          mine.text = filled;
          mine.written = filled;
          setText(filled);
          event.currentTarget.win.requestAnimationFrame(() => ref.current?.select());
        }}
        onBlur={(event) => {
          flush.current();
          onLeave(event.relatedTarget);
        }}
      />
    </span>
  );
}
