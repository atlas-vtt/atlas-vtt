import React, { useEffect, useRef } from 'react';
import { isModHeld } from '../../../keyboard/modKey';
import type { ValueInputProps } from './TextValueInput';
import { useFieldDraft } from './useFieldDraft';

/** Long text also commits after this long without typing, so a crash costs at most this much (§8.5). */
export const IDLE_COMMIT_MS = 1000;

/**
 * Paragraphs in a growing text area (§7.6): Enter starts a new line,
 * Mod+Enter commits, and a second without typing commits too, without leaving
 * the field. Spells (one line per level) edit the same way.
 */
export function MarkdownValueInput({ field, autoFocus, placeholder }: ValueInputProps): React.JSX.Element {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const { draft, setDraft, commit, onKey, focusProps } = useFieldDraft(field, inputRef, autoFocus);
  const typedAt = useRef(0);

  useEffect(() => {
    if (typedAt.current === 0) return undefined;
    const win = inputRef.current?.win ?? window;
    const timer = win.setTimeout(() => void commit(draft), IDLE_COMMIT_MS);
    return () => win.clearTimeout(timer);
  }, [draft, commit]);

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key === 'Enter' && isModHeld(event)) {
      onKey(event);
      return;
    }
    onKey(event, { enterCommits: false });
  };

  return (
    <textarea
      ref={inputRef}
      className="atlas-sb-pane-input atlas-sb-pane-textarea"
      value={draft}
      rows={1}
      placeholder={placeholder ?? (field.prompt?.trim() || field.label)}
      aria-label={field.label}
      onChange={(event) => {
        typedAt.current = Date.now();
        setDraft(event.target.value);
      }}
      onKeyDown={onKeyDown}
      {...focusProps}
    />
  );
}
