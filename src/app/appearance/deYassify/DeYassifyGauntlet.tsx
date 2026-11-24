import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '../../packages/components/primitives/button';
import { LoadingSpinner } from '../../packages/components/primitives/LoadingSpinner';
import { t } from '../../i18n';
import { MimicCaptcha } from './MimicCaptcha';
import './de-yassify.scss';

/** How long "De-yassifying…" pretends to work before it asks again. */
export const DE_YASSIFY_STALL_MS = 3000;

type Stage = 'sure' | 'stalling' | 'extra-sure' | 'captcha';

interface DeYassifyGauntletProps {
  /** The dialog's button row, where each question puts its Yes and No. */
  footer: HTMLElement;
  /** True once the GM got through it all, false for any No. */
  onDone: (deYassify: boolean) => void;
  random?: () => number;
}

/**
 * What stands between a GM and turning Yassify off, annoying on purpose: are you sure (No is the big accent button),
 * a pretend wait, are you extra sure (Yes even smaller), then the mimic captcha.
 */
export function DeYassifyGauntlet({ footer, onDone, random }: DeYassifyGauntletProps): React.JSX.Element {
  const [stage, setStage] = useState<Stage>('sure');

  useEffect(() => {
    if (stage !== 'stalling') return;
    const timer = window.setTimeout(() => setStage('extra-sure'), DE_YASSIFY_STALL_MS);
    return () => window.clearTimeout(timer);
  }, [stage]);

  if (stage === 'stalling') {
    return (
      <div className="atlas-de-yassify__stall">
        <LoadingSpinner size={48} />
        <p className="atlas-de-yassify__question">{t('appearance.deYassify.working')}</p>
      </div>
    );
  }
  if (stage === 'captcha') return <MimicCaptcha onSolved={() => onDone(true)} {...(random && { random })} />;

  const extra = stage === 'extra-sure';
  return (
    <>
      <p className="atlas-de-yassify__question">{t(extra ? 'appearance.deYassify.extraSure' : 'appearance.deYassify.sure')}</p>
      {createPortal(
        <>
          <Button
            variant="ghost"
            size="sm"
            className={extra ? 'atlas-de-yassify__yes atlas-de-yassify__yes--tiny' : 'atlas-de-yassify__yes'}
            onClick={() => setStage(extra ? 'captcha' : 'stalling')}
          >
            {t('appearance.deYassify.yes')}
          </Button>
          <Button size="lg" autoFocus className={extra ? 'atlas-de-yassify__no atlas-de-yassify__no--huge' : 'atlas-de-yassify__no'} onClick={() => onDone(false)}>
            {t('appearance.deYassify.no')}
          </Button>
        </>,
        footer,
      )}
    </>
  );
}
