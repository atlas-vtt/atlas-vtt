import React from 'react';
import { Minus, Plus } from 'lucide-react';
import { Button } from '../../primitives/button';
import { LabelTooltip } from '../../primitives/tooltip';
import { t } from '../../../../i18n';
import { MAX_PICK_COUNT } from './encounterPicks';

interface CountStepperProps {
  name: string;
  count: number;
  onChange: (count: number) => void;
}

/** How many of one creature the encounter holds: − count +, where − on the last one takes it out. */
export function CountStepper({ name, count, onChange }: CountStepperProps): React.JSX.Element {
  return (
    <div className="atlas-encounter-stepper" role="group" aria-label={t('encounter.builder.countOf', { name, count })}>
      <LabelTooltip label={t('encounter.builder.fewer', { name })}>
        <Button variant="ghost" size="icon" className="atlas-encounter-stepper__button" onClick={() => onChange(count - 1)}>
          <Minus />
        </Button>
      </LabelTooltip>
      <span className="atlas-encounter-stepper__count" aria-live="polite">{count}</span>
      <LabelTooltip label={t('encounter.builder.more', { name })}>
        <Button
          variant="ghost"
          size="icon"
          className="atlas-encounter-stepper__button"
          disabled={count >= MAX_PICK_COUNT}
          onClick={() => onChange(count + 1)}
        >
          <Plus />
        </Button>
      </LabelTooltip>
    </div>
  );
}
