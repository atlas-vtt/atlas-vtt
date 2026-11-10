import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { t } from '../../../i18n';

export interface EditableValueProps {
  /** Current display text */
  value: string;
  /** Commits the edited text. Returning false keeps the editor open. */
  onCommit: (next: string) => void | Promise<void>;
  /** Renders the read-only view; defaults to the raw text */
  children?: React.ReactNode;
  /** Multi-line values (trait descriptions) use a textarea */
  multiline?: boolean | undefined;
  ariaLabel?: string | undefined;
}

/**
 * Click-to-edit value. Reads as plain text until clicked, then becomes an
 * input: Enter or blur commits, Escape cancels.
 */
export function EditableValue({
  value,
  onCommit,
  children,
  multiline,
  ariaLabel,
}: EditableValueProps): React.JSX.Element {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  const committedRef = useRef(false);
  const labelId = useId();

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  useLayoutEffect(() => {
    if (!editing) return;
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    input.select();
  }, [editing]);

  const start = (): void => {
    committedRef.current = false;
    setDraft(value);
    setEditing(true);
  };

  const commit = (): void => {
    if (committedRef.current) return;
    committedRef.current = true;
    setEditing(false);
    if (draft !== value) {
      void onCommit(draft);
    }
  };

  const cancel = (): void => {
    committedRef.current = true;
    setDraft(value);
    setEditing(false);
  };

  const onKeyDown = (event: React.KeyboardEvent): void => {
    if (event.key === 'Escape') {
      event.preventDefault();
      cancel();
      return;
    }
    // Enter commits, except in a textarea where it inserts a newline.
    if (event.key === 'Enter' && (!multiline || event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      commit();
    }
  };

  if (editing) {
    const shared = {
      ref: inputRef as never,
      className: 'atlas-sb-editor',
      value: draft,
      onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
        setDraft(event.target.value),
      onBlur: commit,
      onKeyDown,
      'aria-labelledby': ariaLabel ? labelId : undefined,
    };

    return (
      <>
        {multiline ? <textarea {...shared} rows={3} /> : <input {...shared} type="text" />}
        {ariaLabel && <span id={labelId} hidden>{ariaLabel}</span>}
      </>
    );
  }

  return (
    <span
      className="atlas-sb-editable"
      role="button"
      tabIndex={0}
      aria-labelledby={labelId}
      onClick={(event) => {
        // Let dice links and internal links handle their own clicks.
        if ((event.target as HTMLElement).closest('.atlas-dice-link, a')) return;
        event.stopPropagation();
        start();
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          start();
        }
      }}
    >
      {children ?? value}
      <span id={labelId} hidden>{ariaLabel ? t('statblock.editNamed', { name: ariaLabel }) : t('statblock.editValue')}</span>
    </span>
  );
}

export default EditableValue;
