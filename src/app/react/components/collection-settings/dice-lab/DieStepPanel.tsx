import React, { useEffect, useId, useRef } from 'react';
import { Check } from 'lucide-react';
import { cn } from '../../../../../utils/cn';
import { DICE_SET_COLOURS } from '../../../../gameSystems/diceSets';
import { MAX_DICE_NAME_LENGTH } from '../../../../gameSystems/diceSetValidation';
import { DropdownSwatchGrid } from '../../../../packages/components/primitives/DropdownSwatchGrid';
import { LabelTooltip } from '../../../../packages/components/primitives/tooltip';
import { t } from '../../../../i18n';
import type { DieChange, LabDie } from './labDice';
import { SidesStep } from './SidesStep';

/** The steps of a die's fan that open a panel under the die. */
export type DieStep = 'sides' | 'name' | 'colour';

interface DieStepPanelProps {
  step: DieStep;
  die: LabDie;
  /** Opened from the keyboard: its current choice takes focus. */
  focusChoice: boolean;
  /** Why the last change could not be made (it would break a limit of the set), or null. */
  refusal: string | null;
  onChange: (change: DieChange, pace: 'now' | 'typing') => void;
  /** Enter in the name: the step is done. */
  onDone: () => void;
}

function NameStep({ die, onChange, onDone }: Pick<DieStepPanelProps, 'die' | 'onChange' | 'onDone'>): React.ReactElement {
  const ref = useRef<HTMLInputElement>(null);
  const inputId = useId();
  // The name is what this step is for: it is typed at once.
  useEffect(() => { ref.current?.focus({ preventScroll: true }); }, []);
  return (
    <>
      <label htmlFor={inputId} className="atlas-dropdown-swatches__label">{t('diceLab.dieName')}</label>
      <input ref={ref} id={inputId} type="text" className="atlas-csm-input" placeholder={t('diceLab.dieNamePlaceholder')}
        maxLength={MAX_DICE_NAME_LENGTH} spellCheck={false} value={die.name}
        onChange={(event) => onChange({ name: event.target.value }, 'typing')}
        onKeyDown={(event) => { if (event.key === 'Enter') onDone(); }} />
    </>
  );
}

function ColourStep({ die, onChange }: Pick<DieStepPanelProps, 'die' | 'onChange'>): React.ReactElement {
  return (
    <DropdownSwatchGrid label={t('diceLab.colour')} swatches={DICE_SET_COLOURS} value={die.colour ?? ''} onChange={(colour) => onChange({ colour }, 'now')}>
      <LabelTooltip label={t('diceLab.noColourHint')} describe>
        <button type="button" aria-label={t('diceLab.noColour')} aria-pressed={!die.colour} data-current={!die.colour || undefined}
          className={cn('atlas-swatch atlas-dice-lab__swatch-none', !die.colour && 'atlas-swatch--active')}
          onClick={() => onChange({ colour: undefined }, 'now')}>
          {!die.colour && <Check className="atlas-swatch-check" aria-hidden="true" />}
        </button>
      </LabelTooltip>
    </DropdownSwatchGrid>
  );
}

/**
 * What a step of a die's fan opens under the die: its sides (the common dice,
 * or any other typed), its name, or its colour (the set colours, or the dice
 * look of the settings).
 */
export function DieStepPanel({ step, die, focusChoice, refusal, onChange, onDone }: DieStepPanelProps): React.ReactElement {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!focusChoice || step === 'name') return;
    const panel = ref.current;
    const current = panel?.querySelector<HTMLElement>('[data-current]') ?? panel?.querySelector<HTMLElement>('button, input');
    current?.focus({ preventScroll: true });
  }, [focusChoice, step]);

  return (
    <div ref={ref} className={cn('atlas-dice-lab__step', `atlas-dice-lab__step--${step}`)}>
      {step === 'sides' && <SidesStep die={die} onChange={onChange} onDone={onDone} />}
      {step === 'name' && <NameStep die={die} onChange={onChange} onDone={onDone} />}
      {step === 'colour' && <ColourStep die={die} onChange={onChange} />}
      {refusal && <p className="atlas-csm-hint atlas-csm-hint--error" role="alert">{refusal}</p>}
    </div>
  );
}
