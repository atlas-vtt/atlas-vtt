import { useEffect, useRef, useState } from 'react';
import type React from 'react';
import type { EditorSession } from '../sessionTypes';

export interface GestureTextOptions {
  /** What the template holds now. */
  value: string;
  session: EditorSession;
  /** Puts the typed text into the template. */
  onText: (text: string) => void;
  /**
   * `live` (the default): every keystroke shows on the canvas at once, and the
   * whole typing session is one gesture, so one undo step. `commit`: the text
   * is put in once, on Enter or when the input is left (a label that names a
   * new field takes its key from the whole label, never a first letter).
   */
  mode?: 'live' | 'commit' | undefined;
  /** A text area: Enter starts a new line, Mod+Enter finishes. */
  multiline?: boolean | undefined;
}

/** Typing over the session, whatever element takes the keys. */
export interface TextGesture {
  /** The text being typed, or null while nothing is. */
  draft: string | null;
  change: (text: string) => void;
  /** Enter or leaving: what was typed stays, as one step. */
  finish: () => void;
  /** Escape: what was typed goes, and leaves no step. True when there was something to put back. */
  cancel: () => boolean;
}

/**
 * An inspector text over the session (§7.8): typing is one undo step, Enter
 * or leaving ends it, Escape puts back what it changed and leaves no step.
 */
export function useTextGesture(options: GestureTextOptions): TextGesture {
  const [draft, setDraft] = useState<string | null>(null);
  const typed = useRef<string | null>(null);
  const open = useRef(false);
  const latest = useRef(options);
  latest.current = options;

  // A selection change unmounts the input mid-gesture only where no blur came first.
  useEffect(() => () => {
    if (!open.current) return;
    open.current = false;
    latest.current.session.endGesture();
  }, []);

  const show = (text: string | null): void => {
    typed.current = text;
    setDraft(text);
  };

  return {
    draft,
    change: (text) => {
      show(text);
      const { mode = 'live', session, onText } = latest.current;
      if (mode !== 'live') return;
      if (!open.current) {
        session.beginGesture();
        open.current = true;
      }
      onText(text);
    },
    finish: () => {
      const { mode = 'live', session, onText } = latest.current;
      if (mode === 'commit' && typed.current !== null) onText(typed.current);
      if (open.current) {
        open.current = false;
        session.endGesture();
      }
      show(null);
    },
    cancel: () => {
      const had = typed.current !== null;
      if (open.current) {
        open.current = false;
        latest.current.session.abandonGesture();
      }
      show(null);
      return had;
    },
  };
}

type TextElement = HTMLInputElement | HTMLTextAreaElement;

export interface GestureTextProps {
  value: string;
  onChange: (event: React.ChangeEvent<TextElement>) => void;
  onBlur: () => void;
  onKeyDown: (event: React.KeyboardEvent<TextElement>) => void;
}

/** `useTextGesture` as the props of an input or text area. */
export function useGestureText(options: GestureTextOptions): GestureTextProps {
  const gesture = useTextGesture(options);
  return {
    value: gesture.draft ?? options.value,
    onChange: (event) => gesture.change(event.target.value),
    onBlur: gesture.finish,
    onKeyDown: (event) => {
      if (event.nativeEvent.isComposing) return;
      if (event.key === 'Enter' && (!options.multiline || event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        gesture.finish();
      } else if (event.key === 'Escape' && gesture.cancel()) {
        // The input takes this Escape; the next one closes what holds it.
        event.preventDefault();
        event.stopPropagation();
      }
    },
  };
}
