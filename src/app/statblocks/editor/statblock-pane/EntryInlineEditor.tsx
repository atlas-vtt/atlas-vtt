import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { handledByAnotherControl } from '../../../keyboard/tooltipEscape';
import { isModHeld } from '../../../keyboard/modKey';
import type { EntriesBlock, FieldValue, TemplateField } from '../../model/templateTypes';
import type { NotePatch } from '../../notes/patchTypes';
import { entryExtraTexts, entryName, entryText } from '../../values/entryValues';
import { usePartDraft, useExtraDrafts } from './entryDraft';
import { EntryExtraInputs, ENTRY_PART_CONTROL } from './EntryExtraInputs';
import { typingCaret } from './entryFocus';
import {
  entryList, entryPartPatches, entryWithPart, insertEntryPatch, type EntryPartKey, moveEntryToPatch, newEntry, removeEntryPatch, shownEntryIndexes,
} from './entryPatches';
import { singular } from '../../values/entryNoun';
import { removedMessage } from './announcements';
import { focusStaysIn } from './focusWithin';
import { usePaneEdit } from './paneEditContext';
import { caretIn, insertAtCaret, placeCaret, textOf } from './plainEditable';

/** The ability edited, or a new one written after `afterIndex` in the stored list (null: first). */
export type EntryEditing =
  | { kind: 'edit'; item: FieldValue; index: number; shown: number; itemKey: string }
  | { kind: 'new'; afterIndex: number | null; shown: number };

export interface EntryInlineEditorProps {
  block: EntriesBlock;
  field: TemplateField;
  editing: EntryEditing;
}

/**
 * One ability typed in place (spec §6.3): fields where the ability stands,
 * its name, the parts its list's shape names ("Type", "Range") and its text,
 * in the card's own type, so the list around it stays drawn. Enter in the
 * name or a part goes on to the next part or the text; Enter in the text (or
 * Mod+Enter) writes the ability, parts picked included, and starts the next;
 * Shift+Enter breaks the line; Backspace in an empty ability deletes it, as
 * does leaving it with name and text emptied (a held Backspace stops once the
 * ability is empty, and never reaches the one before); Alt+↑/↓ move it and Mod+D
 * duplicates it, each one write to the note that takes what is typed along.
 */
/** What takes focus on a press inside an ability being edited: its inputs, its text and the controls of its parts. */
const FOCUSABLE = 'input, textarea, button, select, [contenteditable], [tabindex], [role="option"]';

export function EntryInlineEditor({ block, field, editing }: EntryInlineEditorProps): React.JSX.Element {
  const pane = usePaneEdit();
  const target = pane.editing;
  const shape = field.entry;
  const rootRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const item = editing.kind === 'edit' ? editing.item : null;
  const startName = item === null ? '' : entryName(item, shape) ?? '';
  const startText = item === null ? '' : entryText(item, shape) ?? '';
  const startExtras = item === null ? {} : entryExtraTexts(item, shape);
  const nameDraft = usePartDraft(startName, item ?? {});
  const extraDrafts = useExtraDrafts();
  const [textStarted] = useState(startText);
  // What the text holds as typed, kept also once the span has gone (the editor closing for another reason writes it).
  const textNow = useRef(startText);
  const textTyped = (): string => (textRef.current?.isConnected ? textOf(textRef.current) : textNow.current);
  const finished = useRef(false);
  /** Whether a key was pressed (not only held) while this editor was open. */
  const pressedHere = useRef(false);
  const noun = singular(field.label) || 'Entry';
  const nameStyle = block.nameStyle ?? 'run-in';

  const list = (): FieldValue[] => entryList(pane.read(field).value);
  const listKey = (): string => pane.read(field).key;
  const write = (patches: ReadonlyArray<NotePatch | null>): void => {
    void pane.write(field, patches.filter((patch): patch is NotePatch => patch !== null));
  };

  /** What was last written from here (a move took the text along): later commits are based on it. */
  const written = useRef<{ item: FieldValue; name: string; text: string; extras: Record<string, string> } | null>(null);
  /** What is typed, to be based on once `after` is written. */
  const writing = (after: FieldValue): NonNullable<typeof written.current> => ({
    item: after, name: nameDraft.value, text: textTyped(), extras: { ...(written.current?.extras ?? startExtras), ...extraDrafts.changed() },
  });

  /** What the ability will read once what is typed is written; and the patches that write it, part by part. */
  const typed = (): { after: FieldValue; patches: NotePatch[] } => {
    const name = nameDraft.value;
    const text = textTyped();
    if (editing.kind === 'new') return { after: newEntry(shape, name, text, extraDrafts.changed()), patches: [] };
    const base = written.current ?? { item: editing.item, name: startName, text: startText, extras: startExtras };
    const extras = Object.entries(extraDrafts.changed()).filter(([key, value]) => value !== (base.extras[key] ?? ''));
    if (name === base.name && text === base.text && extras.length === 0) return { after: base.item, patches: [] };
    const parts: Array<[EntryPartKey, string]> = [['name', name], ...extras.map(([key, value]): [EntryPartKey, string] => [{ extra: key }, value]), ['text', text]];
    let after = base.item;
    const patches: NotePatch[] = [];
    for (const [part, value] of parts) {
      patches.push(...entryPartPatches(listKey(), editing.index, after, shape, part, value));
      after = entryWithPart(after, shape, part, value);
    }
    return { after, patches };
  };

  /** Writes what is typed, once; a new ability left blank is dropped, one emptied is deleted. Returns the ability as it will read. */
  const commit = (): FieldValue | null => {
    if (finished.current) return null;
    finished.current = true;
    nameDraft.end();
    if (editing.kind === 'edit' && !nameDraft.value.trim() && !textTyped().trim()) {
      write([removeEntryPatch(listKey(), written.current?.item ?? editing.item)]);
      pane.announce(removedMessage(startName || noun.toLowerCase()));
      return null;
    }
    const { after, patches } = typed();
    if (editing.kind === 'new') {
      const name = entryName(after, shape);
      const text = entryText(after, shape);
      if (!name && !text) return null;
      write([insertEntryPatch(listKey(), list(), editing.afterIndex, after)]);
      return after;
    }
    write(patches);
    return after;
  };

  // Focus as asked, once, as the editor opens on this ability: the part, and where the caret stood.
  const opening = useRef({ part: target?.part ?? 'name', caret: target?.caret });
  useLayoutEffect(() => {
    const { part, caret } = opening.current;
    if (part === 'text' && textRef.current) {
      textRef.current.focus();
      placeCaret(textRef.current, caret?.[0] ?? textOf(textRef.current).length);
    } else if (nameRef.current) {
      nameRef.current.focus();
      const at = caret ?? [nameRef.current.value.length, nameRef.current.value.length];
      nameRef.current.setSelectionRange(at[0], at[1]);
    }
  }, []);

  // Typed by its value from now on, not its place: a move made meanwhile (another writer, a drag) takes the editor along.
  const anchoring = useRef({ editing, target, pane });
  useEffect(() => {
    const { editing: opened, target: asked, pane: owner } = anchoring.current;
    if (opened.kind === 'edit' && asked && asked.anchor === undefined) owner.start({ ...asked, anchor: opened.item });
  }, []);

  // Moved in the list while typed: the browser may drop focus as the line moves; it comes back where it was.
  const shownAt = editing.kind === 'edit' ? editing.shown : -1;
  const lastFocus = useRef<{ part: 'name' | 'text'; caret: readonly [number, number] | undefined } | null>(null);
  useLayoutEffect(() => {
    const root = rootRef.current;
    const last = lastFocus.current;
    if (!root || !last || root.contains(root.doc.activeElement)) return;
    if (last.part === 'text' && textRef.current) {
      textRef.current.focus();
      placeCaret(textRef.current, last.caret?.[0] ?? textOf(textRef.current).length);
    } else {
      nameRef.current?.focus();
      if (last.caret) nameRef.current?.setSelectionRange(last.caret[0], last.caret[1]);
    }
  }, [shownAt]);

  // A drag's drop while this ability is typed (§7.2): one write with the text and the move, then the same part and caret again.
  const moveRef = useRef<(from: number, to: number) => void>(() => undefined);
  moveRef.current = (from, to) => {
    if (editing.kind !== 'edit') {
      write([moveEntryToPatch(listKey(), list(), from, to)]);
      return;
    }
    const active = rootRef.current?.doc.activeElement ?? null;
    const part = active === textRef.current ? 'text' : 'name';
    const caret = part === 'text' && textRef.current ? caretIn(textRef.current) : active === nameRef.current ? typingCaret(active) : undefined;
    const { after, patches } = typed();
    const order = list().map((value, at): FieldValue => (at === editing.index ? after : value));
    lastFocus.current = { part, caret };
    written.current = writing(after);
    write([...patches, moveEntryToPatch(listKey(), order, from, to)]);
    pane.start({ blockId: block.id, field: field.key, anchor: after, part, caret });
  };
  useEffect(() => pane.registerMover(field.key, (from, to) => moveRef.current(from, to)), [pane, field.key]);

  const nextAfter = (done: FieldValue | null): void => {
    const shown = editing.kind === 'edit' ? editing.shown : Math.max(0, editing.shown - 1);
    if (done === null) pane.stop(true);
    else pane.start({ blockId: block.id, field: field.key, add: true, anchor: done, entry: shown });
  };

  /** Enter in the name or a part: on to the next part, else the text. */
  const focusAfter = (from: EventTarget): void => {
    const parts = [...(rootRef.current?.querySelectorAll<HTMLElement>(`[${ENTRY_PART_CONTROL}]`) ?? [])];
    const next = from === nameRef.current ? parts[0] : parts[parts.indexOf(from as HTMLElement) + 1];
    if (next) next.focus();
    else if (textRef.current) {
      textRef.current.focus();
      placeCaret(textRef.current, textOf(textRef.current).length);
    }
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLElement>): void => {
    // A part's dropdown that took the key (picked, closed, removed a pick) keeps it.
    if (handledByAnotherControl(event.nativeEvent)) return;
    if (!event.repeat) pressedHere.current = true;
    // Backspace held since before this editor opened deleted the ability after this one: it erases nothing here.
    if (event.key === 'Backspace' && event.repeat && !pressedHere.current) {
      event.preventDefault();
      return;
    }
    const inText = event.target === textRef.current;
    const inName = event.target === nameRef.current;
    const inPart = !inText && !inName && (event.target as Partial<Element>).hasAttribute?.(ENTRY_PART_CONTROL) === true;
    const step = event.altKey && editing.kind === 'edit' ? (event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0) : 0;
    if (event.key === 'Escape') {
      event.preventDefault();
      finished.current = true;
      pane.stop(true);
    } else if (step !== 0 && editing.kind === 'edit') {
      event.preventDefault();
      const to = Math.min(Math.max(editing.index + step, 0), list().length - 1);
      moveRef.current(editing.index, to);
    } else if (event.key.toLowerCase() === 'd' && isModHeld(event) && editing.kind === 'edit') {
      event.preventDefault();
      // The text typed goes along in the same write; typing goes on in this ability.
      const { after, patches } = typed();
      written.current = writing(after);
      write([insertEntryPatch(listKey(), list(), editing.index, after), ...patches]);
      pane.start({ blockId: block.id, field: field.key, anchor: after, part: inText ? 'text' : 'name' });
    } else if (event.key === 'Enter' && (inName || inPart) && !isModHeld(event)) {
      event.preventDefault();
      focusAfter(event.target);
    } else if (event.key === 'Enter' && (isModHeld(event) || (inText && !event.shiftKey))) {
      event.preventDefault();
      nextAfter(commit());
    } else if (event.key === 'Enter' && inText && event.shiftKey) {
      event.preventDefault();
      if (textRef.current) insertAtCaret(textRef.current, '\n');
    } else if (event.key === 'Tab' && (inText ? !event.shiftKey : inName && event.shiftKey)) {
      event.preventDefault();
      commit();
      pane.move(field.key, event.shiftKey ? -1 : 1);
    } else if (event.key === 'Backspace' && (inName || inText) && !nameDraft.value && !textTyped()) {
      event.preventDefault();
      // Only a fresh press deletes: a held one stops once the ability is empty.
      if (event.repeat) return;
      finished.current = true;
      if (editing.kind === 'edit') write([removeEntryPatch(listKey(), editing.item)]);
      const before = editing.shown - 1;
      const stored = shownEntryIndexes(list(), shape)[before];
      const previous = stored === undefined ? undefined : list()[stored];
      if (previous === undefined) pane.stop(true);
      else pane.start({ blockId: block.id, field: field.key, anchor: previous, part: 'text' });
    }
  };

  /** A press on a part of the ability that is no control (a part's label, a gap) keeps focus where it is: it would leave the ability and close it. */
  const keepFocusOnBareParts = (event: React.MouseEvent): void => {
    if (event.button !== 0) return;
    if ((event.target as Partial<Element>).closest?.(FOCUSABLE) == null) event.preventDefault();
  };

  const onBlur = (event: React.FocusEvent): void => {
    if (focusStaysIn(rootRef.current, event.relatedTarget)) return;
    commit();
    pane.leave(block.id);
  };

  // Text typed here when the editor goes for another reason (the note changed, the pane closed) is written first.
  const commitRef = useRef(commit);
  commitRef.current = commit;
  useEffect(() => () => { commitRef.current(); }, []);

  return (
    <div
      ref={rootRef}
      className={`atlas-sb-trait atlas-sb-trait--${nameStyle} atlas-sb-pane-entry-editor${editing.kind === 'new' ? ' atlas-sb-pane-entry-editor--new' : ''}`}
      data-item-key={editing.kind === 'edit' ? editing.itemKey : undefined}
      data-item-index={editing.kind === 'edit' ? editing.index : undefined}
      role="group"
      aria-label={editing.kind === 'edit' ? `Edit ${startName || noun.toLowerCase()}` : `New ${noun.toLowerCase()}`}
      onKeyDown={onKeyDown}
      onBlur={onBlur}
      onMouseDown={keepFocusOnBareParts}
    >
      <span className="atlas-sb-trait-name">
        <input
          ref={nameRef}
          type="text"
          className="atlas-sb-pane-input atlas-sb-pane-entry__name"
          data-entry-part="name"
          value={nameDraft.value}
          placeholder={`${noun} name`}
          aria-label={`${noun} name`}
          spellCheck
          onFocus={nameDraft.focus}
          onChange={(event) => nameDraft.change(event.target.value)}
        />
      </span>
      <EntryExtraInputs
        extras={shape?.extras ?? []}
        textOf={(key) => extraDrafts.value(key, startExtras[key] ?? '')}
        onChange={extraDrafts.change}
      />
      <span
        ref={(element) => {
          if (element && textRef.current !== element && element.textContent === '') element.textContent = textStarted;
          textRef.current = element;
        }}
        className="atlas-sb-pane-entry__text"
        data-entry-part="text"
        contentEditable="plaintext-only"
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label={`${noun} description`}
        data-placeholder="What it does"
        tabIndex={0}
        onInput={(event) => { textNow.current = textOf(event.currentTarget); }}
      />
    </div>
  );
}
