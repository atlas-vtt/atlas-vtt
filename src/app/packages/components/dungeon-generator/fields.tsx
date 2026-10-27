import React, { useId } from 'react';
import { Minus, Plus } from 'lucide-react';
import { Button } from '../primitives/button';
import { ToggleSwitch } from '../primitives/Toggle';
import { Select, type SelectOption } from '../primitives/Select';
import { LabelTooltip } from '../primitives/tooltip';

/** Small labelled controls of the generator's wizard. */

interface SwitchRowProps {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  /** What the switch does, in one line: its tooltip. */
  hint?: string;
}

export function SwitchRow({ label, value, onChange, disabled = false, hint }: SwitchRowProps): React.JSX.Element {
  const id = useId();
  const toggle = <ToggleSwitch size="s" value={value} onChange={() => onChange(!value)} labelledBy={id} disabled={disabled} />;
  return (
    <div className="atlas-dungeon-field atlas-dungeon-field--switch">
      <span id={id} className="atlas-dungeon-field__label">{label}</span>
      {hint ? <LabelTooltip label={hint} describe>{toggle}</LabelTooltip> : toggle}
    </div>
  );
}

interface StepperProps {
  /** Names the stepper's group; the field's label. */
  labelledBy: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  /** The tooltips of − and +. */
  fewer: string;
  more: string;
  disabled?: boolean;
}

/** A whole number from `min` to `max`, changed one at a time: − value +. */
export function Stepper({ labelledBy, value, min, max, onChange, fewer, more, disabled = false }: StepperProps): React.JSX.Element {
  return (
    <div className="atlas-dungeon-stepper" role="group" aria-labelledby={labelledBy} aria-disabled={disabled || undefined}>
      <LabelTooltip label={fewer}>
        <Button variant="ghost" size="icon" className="atlas-dungeon-stepper__button" disabled={disabled || value <= min} onClick={() => onChange(value - 1)}>
          <Minus />
        </Button>
      </LabelTooltip>
      <output className="atlas-dungeon-stepper__value" aria-live="polite">{value}</output>
      <LabelTooltip label={more}>
        <Button variant="ghost" size="icon" className="atlas-dungeon-stepper__button" disabled={disabled || value >= max} onClick={() => onChange(value + 1)}>
          <Plus />
        </Button>
      </LabelTooltip>
    </div>
  );
}

interface SelectRowProps<T extends string> {
  label: string;
  value: T;
  options: SelectOption<T>[];
  onChange: (value: T) => void;
  layer?: HTMLElement | null;
}

export function SelectRow<T extends string>({ label, value, options, onChange, layer = null }: SelectRowProps<T>): React.JSX.Element {
  const id = useId();
  return (
    <div className="atlas-dungeon-field">
      <span id={id} className="atlas-dungeon-field__label">{label}</span>
      <Select value={value} options={options} onChange={onChange} labelledBy={id} layer={layer} />
    </div>
  );
}
