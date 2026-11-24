import React, { useCallback, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '../../packages/components/primitives/button';
import { LabelTooltip } from '../../packages/components/primitives/tooltip';
import { t, type MessageKey } from '../../i18n';
import { RIGGED_ATTEMPTS, clickTile, dealAnyRound, settleTile, verdict, type AnyRound, type Verdict } from './mimicCaptcha';
import { photoVerdict, togglePick, type PhotoVerdict } from './photoCaptcha';
import { ChestGrid } from './ChestGrid';
import { PhotoGrid } from './PhotoGrid';

/** Deals the next round: of either kind at random, unless a test deals its own. */
export type DealRound = (random: () => number, nextId: number, trickling: boolean) => AnyRound;

type Complaint = Exclude<Verdict | PhotoVerdict, 'pass' | 'rigged'>;

/** What the captcha says to a failed submission; the rigged ones in turn. */
const RIGGED_LINES: readonly MessageKey[] = ['appearance.deYassify.rigged1', 'appearance.deYassify.rigged2'];
const FAIL_LINES: Readonly<Record<Complaint, MessageKey>> = {
  'still-loading': 'appearance.deYassify.stillLoading',
  'chest-clicked': 'appearance.deYassify.chestClicked',
  'mimic-left': 'appearance.deYassify.mimicLeft',
  'wrong-squares': 'appearance.deYassify.wrongSquares',
};

interface MimicCaptchaProps {
  onSolved: () => void;
  random?: () => number;
  deal?: DealRound;
}

/**
 * "Select all squares with a mimic": rounds of blocky chest squares or of a street photo with a mimic glued on,
 * rigged to fail twice; chest squares arrive slowly, a photo waits until it is drawn.
 */
export function MimicCaptcha({ onSolved, random = Math.random, deal = dealAnyRound }: MimicCaptchaProps): React.JSX.Element {
  const [round, setRound] = useState<AnyRound>(() => deal(random, 0, false));
  const [photoReady, setPhotoReady] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [complaint, setComplaint] = useState<MessageKey | null>(null);

  // Stable, so an arriving square's timer and a photo's drawing are not restarted by each render.
  const settle = useCallback((id: number): void => setRound((current) => (current.kind === 'chests' ? settleTile(current, id) : current)), []);
  const click = (id: number): void => setRound((current) => (current.kind === 'chests' ? clickTile(current, id, random) : current));
  const pick = (square: number): void => setRound((current) => (current.kind === 'photo' ? togglePick(current, square) : current));

  const judge = (): Verdict | PhotoVerdict => {
    if (round.kind === 'chests') return verdict(round, attempt);
    return photoReady ? photoVerdict(round, attempt, RIGGED_ATTEMPTS) : 'still-loading';
  };

  const verify = (): void => {
    const result = judge();
    if (result === 'pass') {
      onSolved();
      return;
    }
    setComplaint(result === 'rigged' ? RIGGED_LINES[attempt % RIGGED_LINES.length]! : FAIL_LINES[result]);
    // Pressed too early: the round stays, and it costs no attempt.
    if (result === 'still-loading') return;
    setAttempt(attempt + 1);
    dealNext();
  };

  /** A new round; a photo of it is not drawn yet. */
  const dealNext = (): void => {
    setPhotoReady(false);
    setRound(deal(random, round.nextId, true));
  };

  return (
    <div className="atlas-mimic-captcha">
      <div className="atlas-mimic-captcha__banner">
        <span className="atlas-mimic-captcha__title">{t('appearance.deYassify.captcha')}</span>
        <span className="atlas-mimic-captcha__hint">{t(round.kind === 'chests' ? 'appearance.deYassify.captchaHint' : 'appearance.deYassify.photoHint')}</span>
      </div>
      {round.kind === 'chests'
        ? <ChestGrid round={round} onClick={click} onArrived={settle} />
        : <PhotoGrid key={round.nextId} round={round} onPick={pick} onReady={setPhotoReady} />}
      <p className="atlas-mimic-captcha__complaint" role="alert">{complaint ? t(complaint) : ''}</p>
      <div className="atlas-mimic-captcha__foot">
        <LabelTooltip label={t('appearance.deYassify.newSquares')}>
          <Button variant="ghost" size="icon" aria-label={t('appearance.deYassify.newSquares')} onClick={dealNext}>
            <RefreshCw aria-hidden="true" />
          </Button>
        </LabelTooltip>
        <Button onClick={verify}>{t('appearance.deYassify.verify')}</Button>
      </div>
    </div>
  );
}
