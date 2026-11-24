import React, { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '../../packages/components/primitives/button';
import { LabelTooltip } from '../../packages/components/primitives/tooltip';
import { t, type MessageKey } from '../../i18n';
import { clickTile, dealRound, verdict, type CaptchaRound, type CaptchaTile, type Verdict } from './mimicCaptcha';

/** What the captcha says to a failed submission; the rigged ones in turn. */
const RIGGED_LINES: readonly MessageKey[] = ['appearance.deYassify.rigged1', 'appearance.deYassify.rigged2'];
const FAIL_LINES: Readonly<Record<Exclude<Verdict, 'pass' | 'rigged'>, MessageKey>> = {
  'chest-clicked': 'appearance.deYassify.chestClicked',
  'mimic-left': 'appearance.deYassify.mimicLeft',
};

interface MimicCaptchaProps {
  onSolved: () => void;
  random?: () => number;
}

/** "Select all squares with a mimic": blocky, dim, rigged; a clicked square is taken away and a new one dealt. */
export function MimicCaptcha({ onSolved, random = Math.random }: MimicCaptchaProps): React.JSX.Element {
  const [round, setRound] = useState<CaptchaRound>(() => dealRound(random));
  const [attempt, setAttempt] = useState(0);
  const [complaint, setComplaint] = useState<MessageKey | null>(null);

  const verify = (): void => {
    const result = verdict(round, attempt);
    if (result === 'pass') {
      onSolved();
      return;
    }
    setComplaint(result === 'rigged' ? RIGGED_LINES[attempt % RIGGED_LINES.length]! : FAIL_LINES[result]);
    setAttempt(attempt + 1);
    setRound(dealRound(random, round.nextId));
  };

  return (
    <div className="atlas-mimic-captcha">
      <div className="atlas-mimic-captcha__banner">
        <span className="atlas-mimic-captcha__title">{t('appearance.deYassify.captcha')}</span>
        <span className="atlas-mimic-captcha__hint">{t('appearance.deYassify.captchaHint')}</span>
      </div>
      <div className="atlas-mimic-captcha__grid">
        {round.tiles.map((tile, at) => (
          <Square key={tile.id} tile={tile} label={t('appearance.deYassify.square', { number: at + 1 })} onClick={() => setRound(clickTile(round, tile.id, random))} />
        ))}
      </div>
      <p className="atlas-mimic-captcha__complaint" role="alert">{complaint ? t(complaint) : ''}</p>
      <div className="atlas-mimic-captcha__foot">
        <LabelTooltip label={t('appearance.deYassify.newSquares')}>
          <Button variant="ghost" size="icon" aria-label={t('appearance.deYassify.newSquares')} onClick={() => setRound(dealRound(random, round.nextId))}>
            <RefreshCw aria-hidden="true" />
          </Button>
        </LabelTooltip>
        <Button onClick={verify}>{t('appearance.deYassify.verify')}</Button>
      </div>
    </div>
  );
}

/** One square: its picture drawn blocky, turned, darkened and cut off; a new square fades in. */
function Square({ tile, label, onClick }: { tile: CaptchaTile; label: string; onClick: () => void }): React.JSX.Element {
  const style = {
    '--atlas-mimic-turn': `${tile.turn}deg`,
    '--atlas-mimic-zoom': String(tile.zoom),
    '--atlas-mimic-shift-x': `${tile.shiftX * 100}%`,
    '--atlas-mimic-shift-y': `${tile.shiftY * 100}%`,
    '--atlas-mimic-brightness': String(tile.brightness),
  } as React.CSSProperties;
  return (
    <button type="button" className="atlas-mimic-captcha__square" aria-label={label} onClick={onClick}>
      <img src={tile.picture} alt="" draggable={false} style={style} />
    </button>
  );
}
