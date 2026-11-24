import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '../../packages/components/primitives/button';
import { LabelTooltip } from '../../packages/components/primitives/tooltip';
import { t, type MessageKey } from '../../i18n';
import { clickTile, dealAnyRound, settleTile, verdict, type CaptchaRound, type Verdict } from './mimicCaptcha';
import { loadScenePictures, type ScenePictures } from './streetScenes';
import { SquareGrid } from './SquareGrid';

/** Deals the next round: in either style at random, unless a test deals its own. */
export type DealRound = (random: () => number, nextId: number, trickling: boolean) => CaptchaRound;

/** What the captcha says to a failed submission; the rigged ones in turn. */
const RIGGED_LINES: readonly MessageKey[] = ['appearance.deYassify.rigged1', 'appearance.deYassify.rigged2'];
const FAIL_LINES: Readonly<Record<Exclude<Verdict, 'pass' | 'rigged'>, MessageKey>> = {
  'still-loading': 'appearance.deYassify.stillLoading',
  'chest-clicked': 'appearance.deYassify.chestClicked',
  'mimic-left': 'appearance.deYassify.mimicLeft',
};

interface MimicCaptchaProps {
  onSolved: () => void;
  random?: () => number;
  deal?: DealRound;
}

/** The street photos and stickers, once loaded; null until then, or for good where they cannot load. */
function useScenePictures(): ScenePictures | null {
  const [pictures, setPictures] = useState<ScenePictures | null>(null);
  useEffect(() => {
    let current = true;
    loadScenePictures().then(
      (loaded) => { if (current) setPictures(loaded); },
      (error: unknown) => { console.error('[MimicCaptcha] Could not load the street photos:', error); },
    );
    return () => { current = false; };
  }, []);
  return pictures;
}

/**
 * "Select all squares with a mimic": rounds of blocky chest squares or of street photos with mimics glued on badly,
 * rigged to fail twice; every new square arrives slowly.
 */
export function MimicCaptcha({ onSolved, random = Math.random, deal = dealAnyRound }: MimicCaptchaProps): React.JSX.Element {
  const [round, setRound] = useState<CaptchaRound>(() => deal(random, 0, false));
  const [attempt, setAttempt] = useState(0);
  const [complaint, setComplaint] = useState<MessageKey | null>(null);
  const pictures = useScenePictures();

  // Stable, so an arriving square's timer is not restarted by each render.
  const settle = useCallback((id: number): void => setRound((current) => settleTile(current, id)), []);

  const verify = (): void => {
    const result = round.style === 'streets' && !pictures ? 'still-loading' : verdict(round, attempt);
    if (result === 'pass') {
      onSolved();
      return;
    }
    setComplaint(result === 'rigged' ? RIGGED_LINES[attempt % RIGGED_LINES.length]! : FAIL_LINES[result]);
    // Pressed too early: the squares stay, and it costs no attempt.
    if (result === 'still-loading') return;
    setAttempt(attempt + 1);
    setRound(deal(random, round.nextId, true));
  };

  return (
    <div className="atlas-mimic-captcha">
      <div className="atlas-mimic-captcha__banner">
        <span className="atlas-mimic-captcha__title">{t('appearance.deYassify.captcha')}</span>
        <span className="atlas-mimic-captcha__hint">{t(round.style === 'streets' ? 'appearance.deYassify.photoHint' : 'appearance.deYassify.captchaHint')}</span>
      </div>
      <SquareGrid round={round} pictures={pictures} onClick={(id) => setRound((current) => clickTile(current, id, random))} onArrived={settle} />
      <p className="atlas-mimic-captcha__complaint" role="alert">{complaint ? t(complaint) : ''}</p>
      <div className="atlas-mimic-captcha__foot">
        <LabelTooltip label={t('appearance.deYassify.newSquares')}>
          <Button variant="ghost" size="icon" aria-label={t('appearance.deYassify.newSquares')} onClick={() => setRound(deal(random, round.nextId, true))}>
            <RefreshCw aria-hidden="true" />
          </Button>
        </LabelTooltip>
        <Button onClick={verify}>{t('appearance.deYassify.verify')}</Button>
      </div>
    </div>
  );
}
