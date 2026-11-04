import React, { useEffect, useRef, useState } from 'react';
import { Check, X } from 'lucide-react';
import { Button } from '../../../packages/components/primitives/button';
import { LabelTooltip } from '../../../packages/components/primitives/tooltip';
import { t } from '../../../i18n';

interface PresetNameInputProps {
  initialName: string;
  confirmLabel: string;
  /** Why a name cannot be used, or null when it can. */
  validate: (name: string) => string | null;
  onConfirm: (name: string) => void;
  onCancel: () => void;
}

/** Inline name field for saving or renaming a preset: Enter confirms, Escape cancels. */
export function PresetNameInput({
  initialName, confirmLabel, validate, onConfirm, onCancel,
}: PresetNameInputProps): React.ReactElement {
  const [name, setName] = useState(initialName);
  const [showError, setShowError] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const error = validate(name);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const confirm = (): void => {
    if (error) setShowError(true);
    else onConfirm(name.trim());
  };

  return (
    <div className="atlas-csm-preset-name">
      <div className="atlas-csm-preset-name__row">
        <input
          ref={inputRef}
          type="text"
          className="atlas-csm-input"
          placeholder={t('csm.system.presetName')}
          value={name}
          aria-invalid={(showError && error !== null) || undefined}
          onChange={(e) => { setName(e.target.value); setShowError(false); }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); confirm(); }
            if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onCancel(); }
          }}
        />
        <LabelTooltip label={confirmLabel}>
          <Button variant="ghost" size="icon" className="atlas-csm-preset-icon-btn" onClick={confirm}>
            <Check />
          </Button>
        </LabelTooltip>
        <LabelTooltip label={t('common.cancel')}>
          <Button variant="ghost" size="icon" className="atlas-csm-preset-icon-btn" onClick={onCancel}>
            <X />
          </Button>
        </LabelTooltip>
      </div>
      {showError && error && <p className="atlas-csm-hint atlas-csm-hint--error" role="alert">{error}</p>}
    </div>
  );
}
