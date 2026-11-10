import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type RefObject } from 'react';
import { handledByAnotherControl } from '../../../keyboard/tooltipEscape';
import type { FieldValue, TemplateField } from '../../model/templateTypes';
import type { FieldRead } from '../../values/fieldValues';
import { usePaneEdit, type PaneEditController } from './paneEditContext';
import { fieldPatches, textOfValue, valueForText } from './valuePatches';

type TextField = HTMLInputElement | HTMLTextAreaElement;

export interface FieldDraft {
  pane: PaneEditController;
  draft: string;
  setDraft: (text: string) => void;
  /** Writes the draft (or `text`) when it differs from what was last written; once per text. */
  commit: (text?: string) => Promise<void>;
  /** Enter, Tab and Escape as every value input takes them; returns true when it took the key. */
  onKey: (event: KeyboardEvent<TextField>, options?: { enterCommits?: boolean }) => boolean;
  /** Spread on the input: registers the commit for closing mid-word and commits on blur. */
  focusProps: { onFocus: () => void; onBlur: () => void };
}

/**
 * One value's text while it is edited (§7.6, §8.2, §8.5). The draft starts
 * from what the note held when editing began and is never replaced by what
 * arrives from the note meanwhile: the focused input keeps its own text. Each
 * commit's patch is based on the value the previous commit wrote, so a
 * change in the note since then is a conflict, never overwritten.
 */
export function useFieldDraft(field: TemplateField, inputRef: RefObject<TextField | null>, autoFocus: boolean): FieldDraft {
  const pane = usePaneEdit();
  const [started] = useState(() => pane.read(field));
  const [draft, setDraft] = useState(() => textOfValue(field, started.value));
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const written = useRef<{ text: string; read: FieldRead }>({ text: textOfValue(field, started.value), read: started });

  useLayoutEffect(() => {
    if (!autoFocus) return;
    const input = inputRef.current;
    input?.focus();
    input?.select();
  }, [autoFocus, inputRef]);

  const commit = useCallback(async (text: string = draftRef.current): Promise<void> => {
    // What was committed is the draft now, also before the input renders it: an input that goes at once writes nothing more.
    draftRef.current = text;
    if (text === written.current.text) return;
    const base = written.current.read;
    const next: FieldValue | undefined = valueForText(field, text);
    written.current = { text, read: { value: next, key: field.key, viaFormerKey: false } };
    await pane.write(field, fieldPatches(field.key, base, next), { base: base.value, mine: next });
  }, [field, pane]);

  const commitRef = useRef(commit);
  commitRef.current = commit;
  const paneRef = useRef(pane);
  paneRef.current = pane;
  // One function per input, so a pane closing mid-word runs the commit of the input that has focus.
  const [pending] = useState(() => (): Promise<void> => commitRef.current());
  // An input that goes while text is typed in it (its note changed, the pane closed) writes the text first.
  useEffect(() => () => {
    paneRef.current.releasePending(pending);
    void commitRef.current(draftRef.current);
  }, [pending]);

  const onKey = useCallback((event: KeyboardEvent<TextField>, options: { enterCommits?: boolean } = {}): boolean => {
    if (event.key === 'Escape') {
      if (handledByAnotherControl(event.nativeEvent)) return true;
      event.preventDefault();
      setDraft(written.current.text);
      draftRef.current = written.current.text;
      pane.stop(true);
      return true;
    }
    if (event.key === 'Tab') {
      event.preventDefault();
      void commit();
      pane.move(field.key, event.shiftKey ? -1 : 1);
      return true;
    }
    if (event.key === 'Enter' && options.enterCommits !== false) {
      event.preventDefault();
      void commit();
      pane.stop(true);
      return true;
    }
    return false;
  }, [commit, field.key, pane]);

  const focusProps = {
    onFocus: (): void => pane.setPending(pending),
    onBlur: (): void => {
      void commit();
    },
  };

  return { pane, draft, setDraft, commit, onKey, focusProps };
}
