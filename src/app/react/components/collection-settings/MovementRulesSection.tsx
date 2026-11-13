/**
 * MovementRulesSection — The steps a token's movement falls into (one move, a second one), each a
 * multiple of its speed with a colour, whether movement adds up over a turn, and the speed of a
 * creature that states none.
 */

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '../../../packages/components/primitives/button';
import { DropdownSwatchGrid } from '../../../packages/components/primitives/DropdownSwatchGrid';
import { fitList } from '../../../packages/components/primitives/popoverFit';
import { clippedViewFrame } from '../../../packages/components/primitives/useKeepInView';
import { ToggleSwitch } from '../../../packages/components/primitives/Toggle';
import { LabelTooltip } from '../../../packages/components/primitives/tooltip';
import {
  isStepMultiple, MAX_MOVEMENT_STEPS, MAX_STEP_MULTIPLE, MAX_STEP_NAME, shownStepMultiple, typedStepMultiple,
  type MovementRules, type MovementStep,
} from '../../../measure/movementRules';
import { RESOURCE_COLORS } from '../../../resources/resourceColors';
import type { CollectionGridDefaults } from '../../../types/collectionSettingsTypes';
import { MovementSpeedRow } from './MovementSpeedRow';
import { SettingRow } from './SettingRow';
import { t } from '../../../i18n';

/** The room between a step's dot and its colours, px (`$spacing-s`). */
const COLOURS_GAP = 8;

/** The colours new steps take in turn: calm first, warmer the farther a token goes. Red is the line's own past the last step. */
const STEP_COLOURS = ['#22c55e', '#f59e0b', '#f97316', '#0ea5e9'];

/** A step added after `steps`: one more times the speed than the last, in the first colour no step has. */
function nextStep(steps: readonly MovementStep[]): MovementStep {
  const last = steps[steps.length - 1]?.multiple;
  const used = new Set(steps.map((step) => step.color.toLowerCase()));
  return {
    name: '',
    multiple: isStepMultiple(last) ? Math.min(MAX_STEP_MULTIPLE, Math.floor(last) + 1) : 1,
    color: STEP_COLOURS.find((colour) => !used.has(colour)) ?? STEP_COLOURS[0]!,
  };
}

interface StepColourProps {
  /** Names the button: whose colour it is. */
  label: string;
  color: string;
  onChange: (color: string) => void;
}

/**
 * A step's colour as a dot; a press opens the colours over the page, so choosing one moves
 * nothing. They hang below the dot, or above it where the dialog's page ends too soon below.
 */
function StepColour({ label, color, onChange }: StepColourProps): React.ReactElement {
  const [isOpen, setIsOpen] = useState(false);
  const [opensUp, setOpensUp] = useState(false);
  const rootRef = useRef<HTMLSpanElement>(null);
  const coloursRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const root = rootRef.current;
    const colours = coloursRef.current;
    setOpensUp(isOpen && root !== null && colours !== null
      && fitList(root.getBoundingClientRect(), colours.offsetHeight, clippedViewFrame(root), COLOURS_GAP).up);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return undefined;
    // The document the dialog is in: a popout hears its presses there.
    const doc = rootRef.current?.ownerDocument ?? document;
    const handlePointerDown = (event: MouseEvent): void => {
      if (!rootRef.current?.contains(event.target as Node | null)) setIsOpen(false);
    };
    doc.addEventListener('mousedown', handlePointerDown);
    return () => doc.removeEventListener('mousedown', handlePointerDown);
  }, [isOpen]);

  // Escape closes the colours and stops there: the dialog leaves a key a control used alone.
  const onKeyDown = (event: React.KeyboardEvent): void => {
    if (event.key !== 'Escape' || !isOpen) return;
    event.preventDefault();
    setIsOpen(false);
  };

  return (
    <span ref={rootRef} className="atlas-csm-step-colour" onKeyDown={onKeyDown}>
      <LabelTooltip label={label}>
        <button
          type="button"
          className="atlas-csm-step-colour__dot"
          aria-expanded={isOpen}
          style={{ backgroundColor: color }}
          onClick={() => setIsOpen((open) => !open)}
        />
      </LabelTooltip>
      {isOpen && (
        <div ref={coloursRef} className={`atlas-csm-step-colour__colours${opensUp ? ' atlas-csm-step-colour__colours--up' : ''}`}>
          <DropdownSwatchGrid label={t('common.colour')} swatches={RESOURCE_COLORS} value={color} onChange={(next) => { onChange(next); setIsOpen(false); }} />
        </div>
      )}
    </span>
  );
}

interface MovementRulesSectionProps {
  /** The rules as typed: a name may be empty and a multiple no number while they are. */
  movement: MovementRules;
  onChange: (movement: MovementRules) => void;
  /** What the collection measures in: a speed is typed in its unit, or picked as one of its range bands. */
  gridDefaults: CollectionGridDefaults;
}

/** Whether every step can be saved: a name, and a multiple above the step before. */
function stepsAreValid(steps: readonly MovementStep[]): boolean {
  return steps.every((step, i) => step.name.trim() !== '' && isStepMultiple(step.multiple) && step.multiple > (steps[i - 1]?.multiple ?? 0));
}

export function MovementRulesSection({ movement, onChange, gridDefaults }: MovementRulesSectionProps): React.ReactElement {
  const { steps } = movement;
  const listRef = useRef<HTMLDivElement>(null);
  /** The step that was just added: its name is typed next. */
  const [added, setAdded] = useState<number | null>(null);

  useEffect(() => {
    if (added === null) return;
    listRef.current?.querySelectorAll<HTMLInputElement>('input[type="text"]')[added]?.focus();
    setAdded(null);
  }, [added]);

  const setSteps = (next: MovementStep[]): void => onChange({ ...movement, steps: next });
  const updateStep = (index: number, partial: Partial<MovementStep>): void => {
    setSteps(steps.map((step, i) => (i === index ? { ...step, ...partial } : step)));
  };
  const addStep = (): void => {
    setSteps([...steps, nextStep(steps)]);
    setAdded(steps.length);
  };

  return (
    <section className="atlas-csm-section" aria-labelledby="atlas-csm-movement-title">
      <h4 id="atlas-csm-movement-title" className="atlas-csm-section-title">{t('csm.movement.title')}</h4>
      <p className="atlas-csm-hint">{t('csm.movement.hint')}</p>
      {steps.length > 0 ? (
        <div ref={listRef} className="atlas-csm-band-list">
          {steps.map((step, i) => {
            const name = step.name.trim();
            const multipleValid = isStepMultiple(step.multiple) && step.multiple > (steps[i - 1]?.multiple ?? 0);
            return (
              <div key={i} className="atlas-csm-band-row atlas-csm-step-row">
                <StepColour
                  label={name ? t('csm.movement.colourOf', { name }) : t('csm.movement.colourOfStep')}
                  color={step.color}
                  onChange={(color) => updateStep(i, { color })}
                />
                <input
                  type="text"
                  className="atlas-csm-input"
                  placeholder={t('csm.movement.step')}
                  aria-label={t('csm.movement.step')}
                  aria-invalid={name === '' || undefined}
                  maxLength={MAX_STEP_NAME}
                  value={step.name}
                  onChange={(e) => updateStep(i, { name: e.target.value })}
                />
                <span className="atlas-csm-step-times">
                  <span aria-hidden="true" className="atlas-csm-step-times__sign">×</span>
                  <LabelTooltip label={t('csm.movement.times')}>
                    <input
                      type="number"
                      className="atlas-csm-input atlas-csm-input--number"
                      aria-invalid={!multipleValid || undefined}
                      min={0.5}
                      max={MAX_STEP_MULTIPLE}
                      step={0.5}
                      value={Number.isNaN(step.multiple) ? '' : shownStepMultiple(step.multiple)}
                      // Keep whatever was typed, even an empty field; Save stays disabled until it is valid.
                      onChange={(e) => updateStep(i, { multiple: typedStepMultiple(e.target.value) })}
                    />
                  </LabelTooltip>
                </span>
                <LabelTooltip label={t('csm.movement.removeStep')}>
                  <Button variant="ghost" size="icon" className="atlas-csm-band-delete" onClick={() => setSteps(steps.filter((_, j) => j !== i))}>
                    <Trash2 />
                  </Button>
                </LabelTooltip>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="atlas-csm-empty">{t('csm.movement.noSteps')}</div>
      )}
      {!stepsAreValid(steps) && (
        <p className="atlas-csm-hint atlas-csm-hint--error" role="alert">{t('csm.movement.stepsInvalid')}</p>
      )}
      <Button variant="ghost" className="atlas-csm-add-btn" disabled={steps.length >= MAX_MOVEMENT_STEPS} onClick={addStep}>
        <Plus />
        {t('csm.movement.addStep')}
      </Button>
      <SettingRow
        label={t('csm.movement.countPerTurn')}
        info={t('csm.movement.countPerTurnInfo')}
        control={(labelId) => (
          <ToggleSwitch labelledBy={labelId} value={movement.countPerTurn} onChange={() => onChange({ ...movement, countPerTurn: !movement.countPerTurn })} />
        )}
      />
      <MovementSpeedRow movement={movement} onChange={onChange} gridDefaults={gridDefaults} />
    </section>
  );
}
