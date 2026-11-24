import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '../../packages/components/primitives/button';
import { LoadingSpinner } from '../../packages/components/primitives/LoadingSpinner';
import { t, type MessageKey } from '../../i18n';
import { MimicCaptcha, type DealRound } from './MimicCaptcha';
import './de-yassify.scss';

/** How long each pretend wait lasts: before the extra-sure ask, and the security check before it asks to go on. */
export const DE_YASSIFY_STALL_MS = 5000;

type Question = 'sure' | 'extra-sure' | 'slow' | 'slow-sure';
type Stall = 'working' | 'checking';
type Stage = Question | Stall | 'captcha';

/** Each pretend wait, what it says and where it leads. */
const STALLS: Readonly<Record<Stall, { text: MessageKey; next: Stage }>> = {
  working: { text: 'appearance.deYassify.working', next: 'extra-sure' },
  checking: { text: 'appearance.deYassify.checking', next: 'slow' },
};

/**
 * Each question, where its Yes leads, whether Yes is squeezed small beside a huge No, and whether the security
 * check's spinner keeps going above it as if it were still checking.
 */
const QUESTIONS: Readonly<Record<Question, { text: MessageKey; next: Stage; squeezed: boolean; spinning: boolean }>> = {
  sure: { text: 'appearance.deYassify.sure', next: 'working', squeezed: false, spinning: false },
  'extra-sure': { text: 'appearance.deYassify.extraSure', next: 'checking', squeezed: true, spinning: false },
  slow: { text: 'appearance.deYassify.slow', next: 'slow-sure', squeezed: false, spinning: true },
  'slow-sure': { text: 'appearance.deYassify.slowSure', next: 'captcha', squeezed: true, spinning: true },
};

const isStall = (stage: Stage): stage is Stall => stage === 'working' || stage === 'checking';

interface DeYassifyGauntletProps {
  /** The dialog's button row, where each question puts its Yes and No. */
  footer: HTMLElement;
  /** True once the GM got through it all, false for any No. */
  onDone: (deYassify: boolean) => void;
  random?: () => number;
  deal?: DealRound;
}

/**
 * What stands between a GM and turning Yassify off, annoying on purpose: are you sure (No is the big accent button),
 * a pretend wait, are you extra sure (Yes even smaller), a pretend security check that asks twice whether to go on
 * while its spinner keeps going, then the mimic captcha.
 */
export function DeYassifyGauntlet({ footer, onDone, random, deal }: DeYassifyGauntletProps): React.JSX.Element {
  const [stage, setStage] = useState<Stage>('sure');

  useEffect(() => {
    if (!isStall(stage)) return;
    const timer = window.setTimeout(() => setStage(STALLS[stage].next), DE_YASSIFY_STALL_MS);
    return () => window.clearTimeout(timer);
  }, [stage]);

  if (stage === 'captcha') return <MimicCaptcha onSolved={() => onDone(true)} {...(random && { random })} {...(deal && { deal })} />;

  const question = isStall(stage) ? null : QUESTIONS[stage];
  const text = question ? question.text : STALLS[stage as Stall].text;
  // One spinner element from the check through both questions after it, so it keeps turning without a jump.
  const spinning = !question || question.spinning;
  return (
    <>
      <div className={spinning ? 'atlas-de-yassify__stall' : undefined}>
        {spinning && <LoadingSpinner size={48} />}
        <p className="atlas-de-yassify__question">{t(text)}</p>
      </div>
      {question && createPortal(
        <>
          <Button
            variant="ghost"
            size="sm"
            className={question.squeezed ? 'atlas-de-yassify__yes atlas-de-yassify__yes--tiny' : 'atlas-de-yassify__yes'}
            onClick={() => setStage(question.next)}
          >
            {t('appearance.deYassify.yes')}
          </Button>
          <Button size="lg" autoFocus className={question.squeezed ? 'atlas-de-yassify__no atlas-de-yassify__no--huge' : 'atlas-de-yassify__no'} onClick={() => onDone(false)}>
            {t('appearance.deYassify.no')}
          </Button>
        </>,
        footer,
      )}
    </>
  );
}
