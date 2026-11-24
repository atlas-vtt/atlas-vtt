import React, { useEffect, useMemo } from 'react';
import { t } from '../../i18n';
import type { CaptchaRound, CaptchaTile } from './mimicCaptcha';
import { drawScene, type ScenePictures } from './streetScenes';

interface SquareGridProps {
  round: CaptchaRound;
  /** What street squares are drawn from; null while still loading, when they take no clicks. */
  pictures: ScenePictures | null;
  onClick: (id: number) => void;
  /** A square's new picture has faded in all the way, with the square's id. */
  onArrived: (id: number) => void;
}

/** The captcha's squares, each its own chest or street photo; a clicked one is taken away and another dealt. */
export function SquareGrid({ round, pictures, onClick, onArrived }: SquareGridProps): React.JSX.Element {
  return (
    <div className="atlas-mimic-captcha__grid">
      {round.tiles.map((tile, at) => (
        <Square key={tile.id} tile={tile} pictures={pictures} label={t('appearance.deYassify.square', { number: at + 1 })} onClick={() => onClick(tile.id)} onArrived={onArrived} />
      ))}
    </div>
  );
}

/** The image a square shows: a chest's picture, or its street scene drawn once; null while the scene cannot be drawn yet. */
function useSquarePicture(tile: CaptchaTile | null, pictures: ScenePictures | null): string | null {
  const scene = tile?.scene;
  const picture = tile?.picture ?? null;
  return useMemo(() => {
    if (!scene) return picture;
    return pictures ? drawScene(scene, pictures) : null;
  }, [scene, picture, pictures]);
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
  pictures: ScenePictures | null;
  label: string;
  onClick: () => void;
  onArrived: (id: number) => void;
}

/**
 * One square. One on its way in shows the square it replaces fading out, an empty gap, then its own picture fading
 * in, drawn by CSS from its arrival; it takes no clicks until then. Its arrival ends on a timer of the same length,
 * not on the animation, so a square still arrives where animations are switched off.
 */
function Square({ tile, pictures, label, onClick, onArrived }: SquareProps): React.JSX.Element {
  const { arrival } = tile;
  const picture = useSquarePicture(tile, pictures);
  const leavingPicture = useSquarePicture(arrival?.leaving ?? null, pictures);
  useEffect(() => {
    if (!arrival) return;
    const timer = window.setTimeout(() => onArrived(tile.id), arrival.outMs + arrival.gapMs + arrival.inMs);
    return () => window.clearTimeout(timer);
  }, [arrival, onArrived, tile.id]);
  const arriving = arrival
    ? { '--atlas-mimic-in-delay': `${arrival.outMs + arrival.gapMs}ms`, '--atlas-mimic-in': `${arrival.inMs}ms` }
    : {};
  return (
    <button type="button" className="atlas-mimic-captcha__square" aria-label={label} aria-busy={arrival || !picture ? true : undefined} disabled={!!arrival || !picture} onClick={onClick}>
      {arrival?.leaving && leavingPicture && (
        <img
          className="atlas-mimic-captcha__leaving"
          src={leavingPicture}
          alt=""
          draggable={false}
          style={{ ...pictureStyle(arrival.leaving), '--atlas-mimic-out': `${arrival.outMs}ms` } as React.CSSProperties}
        />
      )}
      {picture && <img
        className={arrival ? 'atlas-mimic-captcha__arriving' : undefined}
        src={picture}
        alt=""
        draggable={false}
        style={{ ...pictureStyle(tile), ...arriving } as React.CSSProperties}
      />}
    </button>
  );
}
