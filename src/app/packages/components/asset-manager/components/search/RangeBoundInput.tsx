import React, { useEffect, useState } from 'react';
import { formatRating, parseRating } from '../../../../../creatures/creatureValues';

interface RangeBoundInputProps {
  /** The bound the slider's thumb stands on, shown while the field is not being typed in. */
  value: number;
  label: string;
  align: 'start' | 'end';
  /** A typed bound, as a number; the range snaps it to the nearest value its creatures have. */
  onCommit: (bound: number) => void;
}

/**
 * One end of a range filter as a field to type into: a rating as statblocks write it ("1/4", "12")
 * is taken on Enter or when the field is left, and anything that reads as no number puts the
 * bound back.
 */
export function RangeBoundInput({ value, label, align, onCommit }: RangeBoundInputProps): React.JSX.Element {
  const shown = formatRating(value);
  const [text, setText] = useState(shown);
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (!editing) setText(shown);
  }, [shown, editing]);

  const commit = (): void => {
    setEditing(false);
    const bound = parseRating(text);
    if (bound === null || bound === value) setText(shown);
    else onCommit(bound);
  };

  return (
    <input
      type="text"
      className={`atlas-filter-range__input atlas-filter-range__input--${align}`}
      value={text}
      aria-label={label}
      spellCheck={false}
      onFocus={(event) => { setEditing(true); event.currentTarget.select(); }}
      onChange={(event) => setText(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        event.currentTarget.blur();
      }}
    />
  );
}
