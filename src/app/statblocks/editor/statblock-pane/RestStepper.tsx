import React from 'react';
import { Minus, Plus } from 'lucide-react';
import { Button } from '../../../packages/components/primitives/button';
import { LabelTooltip } from '../../../packages/components/primitives/tooltip';
import { t } from '../../../i18n';
import { readableFormula } from '../../../recovery/recoveryFormula';
import type { SpendOffer } from '../../../recovery/restOffer';

interface RestStepperProps {
  /** Names the stepped quantity for assistive technology ("Hit Dice"). */
  label: string;
  /** What it stands at, as shown ("1 of 2"). */
  value: string;
  /** What − and + do, in their tooltips. */
  fewer: string;
  more: string;
  canDecrement: boolean;
  canIncrement: boolean;
  onStep: (by: 1 | -1) => void;
}

/** − value + for one count of the rest chooser: units to spend, or how often an action is picked. */
export function RestStepper({ label, value, fewer, more, canDecrement, canIncrement, onStep }: RestStepperProps): React.JSX.Element {
  return (
    <div className="atlas-sb-rest-stepper" role="group" aria-label={label}>
      <LabelTooltip label={fewer}>
        <Button variant="ghost" size="icon" className="atlas-sb-rest-stepper__button" disabled={!canDecrement} onClick={() => onStep(-1)}>
          <Minus aria-hidden="true" />
        </Button>
      </LabelTooltip>
      <span className="atlas-sb-rest-stepper__value" aria-live="polite">{value}</span>
      <LabelTooltip label={more}>
        <Button variant="ghost" size="icon" className="atlas-sb-rest-stepper__button" disabled={!canIncrement} onClick={() => onStep(1)}>
          <Plus aria-hidden="true" />
        </Button>
      </LabelTooltip>
    </div>
  );
}

interface RestSpendRowProps {
  spend: SpendOffer;
  units: number;
  onChange: (units: number) => void;
}

/** One Spend rule of the rest chooser: what it spends, what one unit gives, and how many units, 0 to what the character holds. */
export function RestSpendRow({ spend, units, onChange }: RestSpendRowProps): React.JSX.Element {
  return (
    <div className="atlas-sb-rest-row">
      <div className="atlas-sb-rest-row__text">
        <span className="atlas-sb-rest-row__name">{spend.label}</span>
        <span className="atlas-sb-rest-row__detail">{t('rest.spendEach', { each: readableFormula(spend.each) })}</span>
      </div>
      <RestStepper
        label={spend.label}
        value={t('rest.spendCount', { n: units, max: spend.max })}
        fewer={t('rest.spendFewer', { label: spend.label })}
        more={t('rest.spendMore', { label: spend.label })}
        canDecrement={units > 0}
        canIncrement={units < spend.max}
        onStep={(by) => onChange(units + by)}
      />
    </div>
  );
}
