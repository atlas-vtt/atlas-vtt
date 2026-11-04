import React, { forwardRef, useEffect, useState } from 'react';
import { cn } from '../../../../utils/cn';

interface CommitTextInputProps {
  value: string;
  /** Called with the text on Enter or on leaving the field, when it changed. */
  onCommit: (text: string) => void;
  /** Names the field for assistive technology (no tooltip in an `atlas-` subtree). */
  label: string;
  placeholder?: string;
  maxLength: number;
  /** A blank text is not taken: the field shows the value again. */
  required?: boolean;
  className?: string;
}

/**
 * A text field of the recovery editor that keeps what is typed to itself until Enter or leaving
 * the field, so a name typed half-way is never a step, and a blank required one never stored.
 * Escape gives back the value and stops there: the dialog listens for Escape on the document.
 */
export const CommitTextInput = forwardRef<HTMLInputElement, CommitTextInputProps>(function CommitTextInput(
  { value, onCommit, label, placeholder, maxLength, required = false, className },
  ref,
): React.ReactElement {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);

  const commit = (): void => {
    if (required && text.trim() === '') {
      setText(value);
      return;
    }
    if (text !== value) onCommit(text);
  };

  return (
    <input
      ref={ref}
      type="text"
      className={cn('atlas-csm-input', className)}
      aria-label={label}
      placeholder={placeholder}
      maxLength={maxLength}
      spellCheck={false}
      value={text}
      onChange={(event) => setText(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          commit();
        } else if (event.key === 'Escape' && text !== value) {
          event.preventDefault();
          event.stopPropagation();
          setText(value);
        }
      }}
    />
  );
});
