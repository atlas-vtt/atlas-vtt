import React, { useRef, useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import { Button } from '../../primitives/button';
import { LabelTooltip } from '../../primitives/tooltip';
import { t } from '../../../../i18n';
import { parseQuantity, stepQuantity, type Quantity } from '../../../../encounters/encounterQuantity';

interface CountStepperProps {
  name: string;
  count: Quantity;
  onChange: (count: Quantity) => void;
}

/**
 * How many of one creature the encounter holds: − count +, where − on the last one takes it out.
 * The count is a field: a number, or dice (`2d4`) rolled each time the encounter is spawned. What
 * reads as neither is put back when the field is left; Escape puts it back too.
 */
export function CountStepper({ name, count, onChange }: CountStepperProps): React.JSX.Element {
  const [draft, setDraft] = useState<string | null>(null);
  const cancelled = useRef(false);
  const shown = String(count);
  const invalid = draft !== null && parseQuantity(draft) === null;
  const dice = typeof count === 'string';
  const more = stepQuantity(count, 1);

  const commit = (): void => {
    const typed = cancelled.current ? null : draft;
    cancelled.current = false;
    setDraft(null);
    const next = typed === null ? null : parseQuantity(typed);
    if (next !== null && next !== count) onChange(next);
  };

  return (
    <div className="atlas-encounter-stepper" role="group" aria-label={t('encounter.builder.countOf', { name, count: shown })}>
      <LabelTooltip label={t(dice ? 'encounter.builder.fewerDice' : 'encounter.builder.fewer', { name })}>
        <Button variant="ghost" size="icon" className="atlas-encounter-stepper__button" onClick={() => onChange(stepQuantity(count, -1))}>
          <Minus />
        </Button>
      </LabelTooltip>
      <LabelTooltip label={t('encounter.builder.quantityHint')} describe suppressed={draft !== null}>
        <input
          type="text"
          className="atlas-encounter-stepper__count"
          value={draft ?? shown}
          aria-label={t('encounter.builder.quantityOf', { name })}
          aria-invalid={invalid}
          spellCheck={false}
          autoComplete="off"
          onFocus={(event) => {
            setDraft(shown);
            event.currentTarget.select();
          }}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' && event.key !== 'Escape') return;
            // Prevented, so the builder does not close on this Escape, nor the tray save on this Enter.
            event.preventDefault();
            event.stopPropagation();
            cancelled.current = event.key === 'Escape';
            event.currentTarget.blur();
          }}
        />
      </LabelTooltip>
      <LabelTooltip label={t(dice ? 'encounter.builder.moreDice' : 'encounter.builder.more', { name })}>
        <Button
          variant="ghost"
          size="icon"
          className="atlas-encounter-stepper__button"
          disabled={more === count}
          onClick={() => onChange(more)}
        >
          <Plus />
        </Button>
      </LabelTooltip>
    </div>
  );
}
