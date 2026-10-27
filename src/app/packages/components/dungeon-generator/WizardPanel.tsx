import React, { useEffect, useRef } from 'react';
import { AnimatePresence, motion, useReducedMotion, type Variants } from 'framer-motion';
import { ArrowRight, Loader2, Map as MapIcon } from 'lucide-react';
import { EASE_OUT_CONTROL_POINTS as EASE_OUT } from '../../../utils/motion';
import { t } from '../../../i18n';
import { cn } from '../../../../utils/cn';
import { Button } from '../primitives/button';
import { CloseButton } from '../primitives/CloseButton';
import { OverlayScroll } from '../primitives/OverlayScroll';
import { LabelTooltip } from '../primitives/tooltip';
import type { Wizard } from './useWizard';
import { WizardStepContent, type CollectionChoice } from './WizardStepContent';
import { stepName, stepTitle, WIZARD_STEPS } from './wizardSteps';

interface WizardPanelProps {
  wizard: Wizard;
  /** Where the scene goes, offered on the Name step where the GM may choose it. */
  collection?: CollectionChoice | undefined;
  /** Shows the close button. */
  onClose?: (() => void) | undefined;
}

const SLIDE_PX = 24;
const STEP_S = 0.22;

/** A step comes in from the side it lies on and the one left goes out the other way. */
const stepVariants: Variants = {
  enter: (direction: number) => ({ opacity: 0, transform: `translateX(${direction * SLIDE_PX}px)` }),
  center: { opacity: 1, transform: 'translateX(0px)', transition: { duration: STEP_S, ease: EASE_OUT } },
  exit: (direction: number) => ({ opacity: 0, transform: `translateX(${-direction * SLIDE_PX}px)`, transition: { duration: STEP_S * 0.7, ease: EASE_OUT } }),
};

const fadingStepVariants: Variants = {
  enter: { opacity: 0 },
  center: { opacity: 1, transition: { duration: STEP_S } },
  exit: { opacity: 0, transition: { duration: STEP_S * 0.7 } },
};

/**
 * The wizard's panel: where it is (the steps as marks, each a way back to it), the step's
 * question and its controls, Back and Next, and Create scene at the end.
 */
export function WizardPanel({ wizard, collection, onClose }: WizardPanelProps): React.JSX.Element {
  const { step, direction, goTo, titleId, state, actions } = wizard;
  const reduced = useReducedMotion() ?? false;
  const shown = WIZARD_STEPS[step]!;
  const last = step === WIZARD_STEPS.length - 1;
  const named = state.name.trim() !== '';
  const create = (): void => { void actions.create(); };
  // Each step starts at its top, wherever the last one was scrolled to.
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => { if (scroller.current) scroller.current.scrollTop = 0; }, [shown]);

  return (
    <>
      <div className="atlas-dungeon-wizard__header">
        <ol className="atlas-dungeon-wizard__progress" aria-label={t('dungeon.steps')}>
          {WIZARD_STEPS.map((id, index) => (
            <li key={id}>
              <LabelTooltip label={stepName(id)}>
                <button
                  type="button"
                  className={cn('atlas-dungeon-wizard__mark', index < step && 'is-done', index === step && 'is-current')}
                  aria-current={index === step ? 'step' : undefined}
                  aria-label={stepName(id)}
                  onClick={() => goTo(index)}
                />
              </LabelTooltip>
            </li>
          ))}
        </ol>
        <span className="atlas-dungeon-wizard__count" aria-live="polite">
          {t('dungeon.step.of', { current: step + 1, count: WIZARD_STEPS.length })}
        </span>
        {onClose && <CloseButton onClick={onClose} />}
      </div>
      <OverlayScroll ref={scroller} frameClassName="atlas-dungeon-wizard__body" className="atlas-dungeon-wizard__scroll">
        <AnimatePresence initial={false} mode="popLayout" custom={direction}>
          <motion.div
            key={shown}
            className="atlas-dungeon-wizard__step"
            custom={direction}
            variants={reduced ? fadingStepVariants : stepVariants}
            initial="enter"
            animate="center"
            exit="exit"
          >
            <h2 id={titleId} className="atlas-dungeon-wizard__title">{stepTitle(shown)}</h2>
            <WizardStepContent step={shown} wizard={wizard} collection={collection} onSubmit={create} />
          </motion.div>
        </AnimatePresence>
      </OverlayScroll>
      <div className="atlas-dungeon-wizard__footer">
        {actions.problem && !actions.creating && <p className="atlas-dungeon-wizard__problem" role="alert">{actions.problem}</p>}
        <div className="atlas-dungeon-wizard__nav">
          <Button variant="ghost" size="sm" className={cn(step === 0 && 'atlas-dungeon-wizard__back--hidden')} disabled={step === 0} onClick={() => goTo(step - 1)}>
            {t('dungeon.back')}
          </Button>
          {last ? (
            <Button variant="default" size="sm" disabled={actions.creating || !named} onClick={create}>
              {actions.creating ? <Loader2 className="atlas-spin" /> : <MapIcon />}
              <span>{actions.creating ? t('dungeon.creating') : t('dungeon.create')}</span>
            </Button>
          ) : (
            <Button variant="default" size="sm" onClick={() => goTo(step + 1)}>
              <span>{t('dungeon.next')}</span>
              <ArrowRight />
            </Button>
          )}
        </div>
      </div>
    </>
  );
}
