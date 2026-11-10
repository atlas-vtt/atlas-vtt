import React, { useState } from 'react';

interface AddNameInputProps {
  labelledBy: string;
  placeholder: string;
  disabled: boolean;
  /** Adds what was typed, trimmed and not empty, on Enter or when the input is left. */
  onAdd: (name: string) => void;
}

/** The input under a list of Options that adds a named entry to its end ("Add a row, like Ki"). */
export function AddNameInput({ labelledBy, placeholder, disabled, onAdd }: AddNameInputProps): React.JSX.Element {
  const [name, setName] = useState('');
  const add = (): void => {
    const label = name.trim();
    if (!label) return;
    setName('');
    onAdd(label);
  };
  return (
    <input
      type="text"
      className="atlas-te-input"
      aria-labelledby={labelledBy}
      placeholder={placeholder}
      disabled={disabled}
      value={name}
      spellCheck={false}
      onChange={(event) => setName(event.target.value)}
      onBlur={add}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
        event.preventDefault();
        add();
      }}
    />
  );
}
