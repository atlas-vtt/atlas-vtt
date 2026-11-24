import React, { useEffect } from 'react';
import { t } from '../../i18n';
import type { CaptchaRound, CaptchaTile } from './mimicCaptcha';

interface ChestGridProps {
  round: CaptchaRound;
  onClick: (id: number) => void;
  /** A square's new picture has faded in all the way, with the square's id. */
  onArrived: (id: number) => void;
}

/** The chest round: each square its own tiny chest or mimic; a clicked one is taken away and another dealt. */
export function ChestGrid({ round, onClick, onArrived }: ChestGridProps): React.JSX.Element {
  return (
    <div className="atlas-mimic-captcha__grid">
      {round.tiles.map((tile, at) => (
        <Square key={tile.id} tile={tile} label={t('appearance.deYassify.square', { number: at + 1 })} onClick={() => onClick(tile.id)} onArrived={onArrived} />
      ))}
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
