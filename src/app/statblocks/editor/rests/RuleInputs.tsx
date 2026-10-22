import React, { useId, useRef, useState } from 'react';
import { cn } from '../../../../utils/cn';
import { t } from '../../../i18n';
import { formulaReads, withFieldReference } from '../../../recovery/editor/recoveryFormulas';
import type { RecoveryButton } from '../../../recovery/recoveryTypes';

/** A number field of the template, offered as `@key`. */
export interface FieldChoice {
  key: string;
  label: string;
}

interface FormulaInputProps {
  label: string;
  value: string;
  fields: readonly FieldChoice[];
  /** Called with every text that reads as a formula; one that does not stays in the field, marked. */
  onChange: (formula: string) => void;
}

/** The template's number fields as chips that put `@key` in at the caret. */
function FieldChips({ fields, onPick }: { fields: readonly FieldChoice[]; onPick: (key: string) => void }): React.ReactElement | null {
  if (fields.length === 0) return null;
  return (
    <div className="atlas-csm-field-chips atlas-rc-card__chips" role="group" aria-label={t('recoveryEditor.card.fields')}>
      {fields.map(({ key, label }) => (
        <button key={key} type="button" className="atlas-csm-field-chip" onClick={() => onPick(key)}>
          {label}<span className="atlas-csm-field-chip__path">@{key}</span>
        </button>
      ))}
    </div>
  );
}

/** A formula field ("1d4+@tier") with the statblock's number fields to click in. */
export function FormulaInput({ label, value, fields, onChange }: FormulaInputProps): React.ReactElement {
  const [text, setText] = useState(value);
  const ref = useRef<HTMLInputElement>(null);
  const hintId = useId();
  const reads = formulaReads(text);

  const type = (next: string): void => {
    setText(next);
    if (formulaReads(next)) onChange(next.trim());
  };

  const insert = (key: string): void => {
    const input = ref.current;
    const { text: next, caret } = withFieldReference(text, key, input?.selectionStart ?? text.length);
    type(next);
    window.requestAnimationFrame(() => {
      input?.focus({ preventScroll: true });
      input?.setSelectionRange(caret, caret);
    });
  };

  return (
    <div className="atlas-rc-card__field atlas-rc-card__field--wide">
      <label className="atlas-rc-card__label">
        {label}
        <input ref={ref} type="text" className="atlas-csm-input atlas-rc-card__formula" spellCheck={false} value={text}
          aria-invalid={reads ? undefined : true} aria-describedby={reads ? undefined : hintId}
          onChange={(event) => type(event.target.value)} />
      </label>
      {!reads && <span id={hintId} className="atlas-csm-hint atlas-csm-hint--error">{t('recoveryEditor.card.badFormula')}</span>}
      <FieldChips fields={fields} onPick={insert} />
    </div>
  );
}

interface WholeInputProps {
  label: string;
  value: number | undefined;
  /** The least number it takes. */
  least: number;
  /** Empty means unset. */
  optional?: boolean;
  /** On a line of its own, the label beside a short field. */
  inline?: boolean;
  onChange: (value: number | undefined) => void;
}

const WHOLE = /^\d{1,7}$/;

/** A whole number; an optional one may be left empty. */
export function WholeInput({ label, value, least, optional = false, inline = false, onChange }: WholeInputProps): React.ReactElement {
  const [text, setText] = useState(value === undefined ? '' : String(value));
  const accepts = (read: string): boolean => (optional && read === '') || (WHOLE.test(read) && Number(read) >= least);
  const valid = accepts(text.trim());

  return (
    <label className={cn('atlas-rc-card__field atlas-rc-card__label', inline && 'atlas-rc-card__field--inline')}>
      {label}
      <input type="text" inputMode="numeric" className="atlas-csm-input atlas-rc-card__number" value={text}
        placeholder={optional ? t('recoveryEditor.card.optional') : undefined}
        aria-invalid={valid ? undefined : true}
        onChange={(event) => {
          const next = event.target.value;
          setText(next);
          const read = next.trim();
          if (accepts(read)) onChange(read === '' ? undefined : Number(read));
        }} />
    </label>
  );
}

interface RowsChipsProps {
  rows: 'all' | readonly string[];
  buttons: readonly RecoveryButton[];
  onChange: (rows: 'all' | readonly string[]) => void;
}

/**
 * Which rows of a Counters field the rule gives uses back to: all of them, or those whose reset
 * names one of the template's buttons (a Long rest restores the rows set to Short rest as well).
 */
export function RowsChips({ rows, buttons, onChange }: RowsChipsProps): React.ReactElement {
  const toggle = (id: string): void => {
    const picked = rows === 'all' ? [] : rows;
    const next = picked.includes(id) ? picked.filter((row) => row !== id) : [...picked, id];
    onChange(next.length === 0 ? 'all' : buttons.map((button) => button.id).filter((row) => next.includes(row)));
  };
  return (
    <div className="atlas-rc-card__field atlas-rc-card__field--wide">
      <span className="atlas-rc-card__label">{t('recoveryEditor.card.rows')}</span>
      <div className="atlas-csm-field-chips atlas-rc-card__chips" role="group" aria-label={t('recoveryEditor.card.rows')}>
        <button type="button" className={cn('atlas-csm-field-chip', rows === 'all' && 'atlas-selected')} aria-pressed={rows === 'all'} onClick={() => onChange('all')}>
          {t('recoveryEditor.card.allRows')}
        </button>
        {buttons.map((button) => {
          const on = rows !== 'all' && rows.includes(button.id);
          return (
            <button key={button.id} type="button" className={cn('atlas-csm-field-chip', on && 'atlas-selected')} aria-pressed={on} onClick={() => toggle(button.id)}>
              {button.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}
