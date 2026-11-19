import React, { useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import { MAX_MODIFIER, TRAY_SURFACE, TRAY_TOOLTIP_GAP, clampModifier, formatModifier } from './diceTrayPool';
import { LabelTooltip } from '../../../packages/components/primitives/tooltip';
import { t } from '../../../i18n';

interface DiceTrayModifierProps {
  value: number;
  /** Sets the modifier to a typed value. */
  onChange: (modifier: number) => void;
  /** Steps it one up or down from what it is when the step lands (two quick clicks make two steps). */
  onStep: (delta: 1 | -1) => void;
}

// `+3`, `-3`, `−3` or `3`: what a typed modifier may be.
const TYPED = /^\s*([+\-−]?)\s*(\d{1,4})\s*$/;

/** The number typed into the modifier, held within its range; null for anything else. */
export function readModifier(text: string): number | null {
  const typed = TYPED.exec(text);
  if (!typed) return null;
  const value = Number(typed[2]) * (typed[1] === '' || typed[1] === '+' ? 1 : -1);
  return clampModifier(value);
}

/**
 * The modifier: one field with its steps worked into its ends. Its value can be
 * typed (`+5`, `-2`); Enter or leaving the field takes it, anything that is no
 * number puts the old value back. Its name is spoken and shown in its tooltip,
 * not written beside it: next to the formula, `+3` says what it is.
 */
export function DiceTrayModifier({ value, onChange, onStep }: DiceTrayModifierProps): React.ReactElement {
  const [draft, setDraft] = useState<string | null>(null);

  const commit = (): void => {
    if (draft === null) return;
    const typed = readModifier(draft);
    setDraft(null);
    if (typed !== null && typed !== value) onChange(typed);
  };

  return (
    <div className="atlas-dice-tray__modifier" role="group" aria-label={t('diceRoll.modifier')}>
      <div className="atlas-dice-tray__stepper">
        <LabelTooltip outside={TRAY_SURFACE} side="left" sideOffset={TRAY_TOOLTIP_GAP} label={t('diceRoll.decreaseModifier')} shortcut="−">
          <button type="button" className="atlas-dice-tray__step" onClick={() => onStep(-1)} disabled={value <= -MAX_MODIFIER} aria-label={t('diceRoll.decreaseModifier')}>
            <Minus aria-hidden="true" />
          </button>
        </LabelTooltip>
        <input
          type="text"
          inputMode="numeric"
          className="atlas-dice-tray__modifier-value"
          aria-label={t('diceRoll.modifier')}
          spellCheck={false}
          autoComplete="off"
          value={draft ?? formatModifier(value)}
          onFocus={(event) => {
            setDraft(formatModifier(value));
            event.currentTarget.select();
          }}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            commit();
          }}
        />
        <LabelTooltip outside={TRAY_SURFACE} side="right" sideOffset={TRAY_TOOLTIP_GAP} label={t('diceRoll.increaseModifier')} shortcut="+">
          <button type="button" className="atlas-dice-tray__step" onClick={() => onStep(1)} disabled={value >= MAX_MODIFIER} aria-label={t('diceRoll.increaseModifier')}>
            <Plus aria-hidden="true" />
          </button>
        </LabelTooltip>
      </div>
    </div>
  );
}
