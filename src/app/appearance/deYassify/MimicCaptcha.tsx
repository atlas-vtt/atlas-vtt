import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '../../packages/components/primitives/button';
import { LabelTooltip } from '../../packages/components/primitives/tooltip';
import { t, type MessageKey } from '../../i18n';
import { clickTile, dealRound, settleTile, verdict, type CaptchaRound, type CaptchaTile, type Verdict } from './mimicCaptcha';

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
}

/** "Select all squares with a mimic": blocky, dim, rigged; a clicked square is taken away and a new one dealt. */
export function MimicCaptcha({ onSolved, random = Math.random }: MimicCaptchaProps): React.JSX.Element {
  const [round, setRound] = useState<CaptchaRound>(() => dealRound(random));
  const [attempt, setAttempt] = useState(0);
  const [complaint, setComplaint] = useState<MessageKey | null>(null);

  // One function for every square, so an arriving square's timer is not restarted by each render.
  const settle = useCallback((id: number): void => setRound((current) => settleTile(current, id)), []);

  const verify = (): void => {
    const result = verdict(round, attempt);
    if (result === 'pass') {
      onSolved();
      return;
    }
    setComplaint(result === 'rigged' ? RIGGED_LINES[attempt % RIGGED_LINES.length]! : FAIL_LINES[result]);
    // Pressed too early: the squares stay, and it costs no attempt.
    if (result === 'still-loading') return;
    setAttempt(attempt + 1);
    setRound(dealRound(random, round.nextId, true));
  };

  return (
    <div className="atlas-mimic-captcha">
      <div className="atlas-mimic-captcha__banner">
        <span className="atlas-mimic-captcha__title">{t('appearance.deYassify.captcha')}</span>
        <span className="atlas-mimic-captcha__hint">{t('appearance.deYassify.captchaHint')}</span>
      </div>
      <div className="atlas-mimic-captcha__grid">
        {round.tiles.map((tile, at) => (
          <Square
            key={tile.id}
            tile={tile}
            label={t('appearance.deYassify.square', { number: at + 1 })}
            onClick={() => setRound((current) => clickTile(current, tile.id, random))}
            onArrived={settle}
          />
        ))}
      </div>
      <p className="atlas-mimic-captcha__complaint" role="alert">{complaint ? t(complaint) : ''}</p>
      <div className="atlas-mimic-captcha__foot">
        <LabelTooltip label={t('appearance.deYassify.newSquares')}>
          <Button variant="ghost" size="icon" aria-label={t('appearance.deYassify.newSquares')} onClick={() => setRound(dealRound(random, round.nextId, true))}>
            <RefreshCw aria-hidden="true" />
          </Button>
        </LabelTooltip>
        <Button onClick={verify}>{t('appearance.deYassify.verify')}</Button>
      </div>
    </div>
  );
}

/** How a picture is drawn in its square: turned, darkened, blown up past it and moved, so part of it is cut off. */
function pictureStyle(tile: CaptchaTile): Record<string, string> {
  return {
    '--atlas-mimic-turn': `${tile.turn}deg`,
    '--atlas-mimic-zoom': String(tile.zoom),
    '--atlas-mimic-shift-x': `${tile.shiftX * 100}%`,
    '--atlas-mimic-shift-y': `${tile.shiftY * 100}%`,
    '--atlas-mimic-brightness': String(tile.brightness),
  };
}

interface SquareProps {
  tile: CaptchaTile;
  label: string;
  onClick: () => void;
  /** The new picture has faded in all the way, with the square's id. */
  onArrived: (id: number) => void;
}

/**
 * One square. One on its way in shows the square it replaces fading out, an empty gap, then its own picture fading
 * in, drawn by CSS from its arrival; it takes no clicks until then. Its arrival ends on a timer of the same length,
 * not on the animation, so a square still arrives where animations are switched off.
 */
function Square({ tile, label, onClick, onArrived }: SquareProps): React.JSX.Element {
  const { arrival } = tile;
  useEffect(() => {
    if (!arrival) return;
    const timer = window.setTimeout(() => onArrived(tile.id), arrival.outMs + arrival.gapMs + arrival.inMs);
    return () => window.clearTimeout(timer);
  }, [arrival, onArrived, tile.id]);
  const arriving = arrival
    ? { '--atlas-mimic-in-delay': `${arrival.outMs + arrival.gapMs}ms`, '--atlas-mimic-in': `${arrival.inMs}ms` }
    : {};
  return (
    <button type="button" className="atlas-mimic-captcha__square" aria-label={label} aria-busy={arrival ? true : undefined} disabled={!!arrival} onClick={onClick}>
      {arrival?.leaving && (
        <img
          className="atlas-mimic-captcha__leaving"
          src={arrival.leaving.picture}
          alt=""
          draggable={false}
          style={{ ...pictureStyle(arrival.leaving), '--atlas-mimic-out': `${arrival.outMs}ms` } as React.CSSProperties}
        />
      )}
      <img
        className={arrival ? 'atlas-mimic-captcha__arriving' : undefined}
        src={tile.picture}
        alt=""
        draggable={false}
        style={{ ...pictureStyle(tile), ...arriving } as React.CSSProperties}
      />
    </button>
  );
}
