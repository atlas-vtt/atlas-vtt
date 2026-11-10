import React, { useState } from 'react';
import { cn } from '../../../../utils/cn';
import { t } from '../../../i18n';
import type { SetRule } from '../../../recovery/recoveryTypes';
import type { FieldChoice } from './RuleInputs';

interface SetToInputProps {
  value: SetRule['to'];
  fields: readonly FieldChoice[];
  onChange: (to: SetRule['to']) => void;
}

const WHOLE = /^\d{1,7}$/;
const FIELD = /^@([A-Za-z_][\w-]*(?:\.[\w-]+)*)$/;

/** What a Set rule's text says: a whole number, or a statblock field written `@key`; undefined where neither. */
function readTo(text: string): SetRule['to'] | undefined {
  const trimmed = text.trim();
  if (WHOLE.test(trimmed)) return Number(trimmed);
  const field = FIELD.exec(trimmed)?.[1];
  return field ? { field } : undefined;
}

const written = (to: SetRule['to']): string => (typeof to === 'number' ? String(to) : `@${to.field}`);

/** What a Set rule sets the metric to: a number ("0"), or the number a statblock field holds. */
export function SetToInput({ value, fields, onChange }: SetToInputProps): React.ReactElement {
  const [text, setText] = useState(written(value));
  const type = (next: string): void => {
    setText(next);
    const read = readTo(next);
    if (read !== undefined) onChange(read);
  };

  return (
    <div className="atlas-rc-card__field atlas-rc-card__field--wide">
      <label className="atlas-rc-card__label">
        {t('recoveryEditor.card.setTo')}
        <input type="text" className="atlas-csm-input atlas-rc-card__formula" spellCheck={false} value={text}
          aria-invalid={readTo(text) === undefined ? true : undefined} onChange={(event) => type(event.target.value)} />
      </label>
      {fields.length > 0 && (
        <div className="atlas-csm-field-chips atlas-rc-card__chips" role="group" aria-label={t('recoveryEditor.card.fields')}>
          {fields.map(({ key, label }) => {
            const on = typeof value !== 'number' && value.field === key;
            return (
              <button key={key} type="button" className={cn('atlas-csm-field-chip', on && 'atlas-selected')} aria-pressed={on} onClick={() => type(`@${key}`)}>
                {label}<span className="atlas-csm-field-chip__path">@{key}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
