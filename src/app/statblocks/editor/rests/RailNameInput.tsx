import React, { useEffect, useRef, useState } from 'react';
import { t } from '../../../i18n';

interface RailNameInputProps {
  initial: string;
  onCommit: (name: string) => void;
  onCancel: () => void;
}

/** The longest name a button or action takes (`parseRecovery` reads up to 100 characters). */
export const MAX_NAME_LENGTH = 40;

/**
 * A capsule of the rail being named: Enter or leaving the field keeps the name, Escape keeps the
 * one before. Escape stops here, so the dialog stays open.
 */
export function RailNameInput({ initial, onCommit, onCancel }: RailNameInputProps): React.ReactElement {
  const [name, setName] = useState(initial);
  const ref = useRef<HTMLInputElement>(null);
  const done = useRef(false);

  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
    ref.current?.select();
  }, []);

  const finish = (commit: boolean): void => {
    if (done.current) return;
    done.current = true;
    if (commit) onCommit(name);
    else onCancel();
  };

  return (
    <input
      ref={ref}
      type="text"
      className="atlas-rc-capsule atlas-rc-capsule--input"
      aria-label={t('recoveryEditor.nameLabel')}
      placeholder={t('recoveryEditor.namePlaceholder')}
      maxLength={MAX_NAME_LENGTH}
      spellCheck={false}
      // As wide as the name, so the capsule grows while it is typed
      size={Math.max(name.length, t('recoveryEditor.namePlaceholder').length, 4)}
      value={name}
      onChange={(event) => setName(event.target.value)}
      onBlur={() => finish(true)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          finish(true);
        } else if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          finish(false);
        }
      }}
    />
  );
}
