import React, { useCallback, useId, useState } from 'react';
import { getLocale, t } from '../../../i18n';
import { textLength } from '../../upload/listingDraft';
import { MAX_TAGS, TAG_GROUPS, type TagId, type TextLimits } from '../../upload/uploadContract';
import { fieldProblemMessage } from '../../upload/text/uploadMessages';
import { tagGroupLabel, tagLabel } from '../../upload/text/listingVocabulary';

/** The overlay of the dialog `node` stands in: a select's list opens there, over the scrolling page. */
export function useOverlayLayer(): [HTMLElement | null, (node: HTMLElement | null) => void] {
  const [layer, setLayer] = useState<HTMLElement | null>(null);
  const ref = useCallback((node: HTMLElement | null) => setLayer(node?.closest<HTMLElement>('.atlas-transfer-overlay') ?? null), []);
  return [layer, ref];
}

/** What is wrong with a field, under it and read with it. */
export function FieldProblem({ id, field, problems }: { id: string; field: string; problems: Readonly<Record<string, string>> }): React.JSX.Element | null {
  const problem = problems[field];
  if (problem === undefined) return null;
  return <p id={id} className="atlas-share-field__problem" role="alert">{fieldProblemMessage(field, problem)}</p>;
}

interface CountedTextProps {
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
  limits: TextLimits;
  rows: number;
  field: string;
  problems: Readonly<Record<string, string>>;
}

/** A text field with its label and a live count against its limit, as the Armarium counts. */
export function CountedText({ label, hint, value, onChange, limits, rows, field, problems }: CountedTextProps): React.JSX.Element {
  const id = useId();
  const count = textLength(value);
  const over = count > limits.max;
  const short = limits.min > 0 && count < limits.min;
  const number = (n: number): string => n.toLocaleString(getLocale());
  return (
    <div className="atlas-share-field">
      <label className="atlas-share-field__label" htmlFor={id}>{label}</label>
      {hint !== undefined && <span className="atlas-share-field__hint">{hint}</span>}
      <textarea
        id={id}
        className="atlas-input atlas-share-field__text"
        rows={rows}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={over || problems[field] !== undefined || undefined}
        aria-describedby={`${id}-count ${id}-problem`}
      />
      <span id={`${id}-count`} className="atlas-share-field__count" data-over={over || undefined}>
        {short ? t('armariumShare.countAtLeast', { count: number(count), min: number(limits.min), max: number(limits.max) }) : t('armariumShare.count', { count: number(count), max: number(limits.max) })}
      </span>
      <FieldProblem id={`${id}-problem`} field={field} problems={problems} />
    </div>
  );
}

/** The Armarium's tags in their groups, ticked as toggle buttons; one AI tag at most, eight in all. */
export function TagPicker({ value, onToggle, problems }: { value: readonly TagId[]; onToggle: (tag: TagId) => void; problems: Readonly<Record<string, string>> }): React.JSX.Element {
  const id = useId();
  const full = value.length >= MAX_TAGS;
  return (
    <fieldset className="atlas-share-field atlas-share-tags" aria-describedby={`${id}-count`}>
      <legend className="atlas-share-field__label">{t('armariumShare.tags')}</legend>
      <span id={`${id}-count`} className="atlas-share-field__hint">{t('armariumShare.tagsCount', { count: value.length, max: MAX_TAGS })}</span>
      {TAG_GROUPS.map((group) => (
        <div key={group.id} className="atlas-share-tags__group" role="group" aria-label={tagGroupLabel(group.id)}>
          <span className="atlas-share-tags__group-label" aria-hidden="true">{tagGroupLabel(group.id)}</span>
          <div className="atlas-share-tags__list">
            {group.tags.map((tag) => {
              const on = value.includes(tag);
              const exclusive = group.id === 'ai';
              return (
                <button
                  key={tag}
                  type="button"
                  className="atlas-share-tag"
                  aria-pressed={on}
                  disabled={!on && full && !(exclusive && value.some((chosen) => group.tags.some((member) => member === chosen)))}
                  onClick={() => onToggle(tag)}
                >
                  {tagLabel(tag)}
                </button>
              );
            })}
          </div>
        </div>
      ))}
      <FieldProblem id={`${id}-problem`} field="tags" problems={problems} />
    </fieldset>
  );
}
