import React, { useRef } from 'react';
import { cn } from '../../../../utils/cn';
import type { TemplateField } from '../../model/templateTypes';
import { diceAverage } from '../../values/diceNotation';
import { formatNumber, parseNumberText } from '../../values/numberText';
import { PLAIN_TEXT } from '../markdown-typing/textFields';
import { useFieldDraft } from './useFieldDraft';
import { WarningDot } from './ValueMarks';
import { valuePlaceholder, valueProblem } from './valuePatches';

export interface ValueInputProps {
  field: TemplateField;
  /** Focuses the input and selects its text as it mounts: the value the edit started on. */
  autoFocus: boolean;
  /** What an empty input shows: the prompt its block showed, else the field's own. */
  placeholder?: string | undefined;
}

const STEPS: Readonly<Record<string, number>> = { ArrowUp: 1, ArrowDown: -1 };

/** Fields whose text is no Markdown: formatting keys and link suggestions leave them alone. */
const PLAIN_TYPES: ReadonlySet<TemplateField['type']> = new Set(['number', 'dice']);

/** "avg 13" for dice that roll; nothing for text that is not dice yet. */
function averageHint(field: TemplateField, draft: string): string | null {
  if (field.type !== 'dice') return null;
  const average = diceAverage(draft);
  return average === null ? null : `avg ${formatNumber(Math.round(average * 10) / 10)}`;
}

/**
 * One line of text in a value's own spot (§7.6): text, numbers, ratings, dice
 * and the rest that are typed. Numbers step with ↑/↓ (Shift: by 10); what does
 * not parse is kept as typed and gets a warning dot.
 */
export function TextValueInput({ field, autoFocus, placeholder }: ValueInputProps): React.JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null);
  const { draft, setDraft, onKey, focusProps } = useFieldDraft(field, inputRef, autoFocus);
  const problem = valueProblem(field, draft);
  const hint = averageHint(field, draft);

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    if (onKey(event)) return;
    const step = STEPS[event.key];
    if (step === undefined || field.type !== 'number') return;
    event.preventDefault();
    const now = parseNumberText(draft) ?? 0;
    setDraft(formatNumber(now + step * (event.shiftKey ? 10 : 1)));
  };

  return (
    <span className="atlas-sb-pane-field">
      <input
        ref={inputRef}
        type="text"
        className={cn('atlas-sb-pane-input', problem && 'has-problem')}
        value={draft}
        placeholder={placeholder ?? valuePlaceholder(field)}
        aria-label={field.label}
        aria-invalid={problem ? true : undefined}
        spellCheck={field.type === 'text'}
        {...(PLAIN_TYPES.has(field.type) && PLAIN_TEXT)}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={onKeyDown}
        {...focusProps}
      />
      {hint && <span className="atlas-sb-pane-hint" aria-hidden="true">{hint}</span>}
      {problem && <WarningDot problem={problem} />}
    </span>
  );
}
