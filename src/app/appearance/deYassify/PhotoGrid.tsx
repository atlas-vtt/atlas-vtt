import React, { useEffect, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import { getDomHost } from '../../host/dom';
import { loadImage } from '../../dice3d/dieNumerals';
import { t } from '../../i18n';
import type { PhotoRound, Sticker } from './photoCaptcha';

interface PhotoGridProps {
  round: PhotoRound;
  onPick: (square: number) => void;
  /** The round's picture is drawn: until then its squares take no clicks and Verify waits. Mount one grid per round. */
  onReady: (ready: true) => void;
}

/**
 * The photo round: one picture cut into squares, as reCAPTCHA's street photos are. The photo and its glued-on
 * stickers are drawn once, at the round's small size, and every square shows its part of that, blown up blocky.
 */
export function PhotoGrid({ round, onPick, onReady }: PhotoGridProps): React.JSX.Element {
  const [picture, setPicture] = useState<string | null>(null);
  // Drawn once: a new deal mounts a new grid (keyed by the round), and a pick changes no picture.
  const firstRound = useRef(round);

  useEffect(() => {
    let current = true;
    void drawRound(firstRound.current).then((url) => {
      if (!current) return;
      setPicture(url);
      onReady(true);
    });
    return () => { current = false; };
  }, [onReady]);

  const squares = Array.from({ length: round.side * round.side }, (_, square) => square);
  return (
    <div className="atlas-mimic-captcha__grid atlas-mimic-captcha__grid--photo" style={{ '--atlas-mimic-side': String(round.side) } as React.CSSProperties}>
      {squares.map((square) => {
        const picked = round.picked.has(square);
        const column = square % round.side;
        const row = Math.floor(square / round.side);
        const style = picture
          ? {
              backgroundImage: `url("${picture}")`,
              backgroundSize: `${round.side * 100}% ${round.side * 100}%`,
              backgroundPosition: `${(column / (round.side - 1)) * 100}% ${(row / (round.side - 1)) * 100}%`,
            }
          : undefined;
        return (
          <button
            key={square}
            type="button"
            className="atlas-mimic-captcha__square atlas-mimic-captcha__piece"
            aria-label={t('appearance.deYassify.square', { number: square + 1 })}
            aria-pressed={picked}
            aria-busy={picture ? undefined : true}
            disabled={!picture}
            onClick={() => onPick(square)}
          >
            <span className="atlas-mimic-captcha__piece-picture" style={style} />
            {picked && <Check className="atlas-mimic-captcha__tick" aria-hidden="true" />}
          </button>
        );
      })}
    </div>
  );
}

/** The round's photo with its stickers glued on, `pixels` wide, as an image URL; the bare photo where no canvas draws. */
async function drawRound(round: PhotoRound): Promise<string> {
  const stickers = [round.mimic, ...(round.decoy ? [round.decoy] : [])];
  const [photo, ...cutOuts] = await Promise.all([loadImage(round.photo), ...stickers.map((sticker) => loadImage(sticker.picture))]);
  const size = round.pixels;
  const canvas = getDomHost().createCanvas(undefined, { width: size, height: size });
  const context = canvas.getContext('2d');
  if (!context || !photo) return round.photo;
  context.drawImage(photo, 0, 0, size, size);
  stickers.forEach((sticker, at) => glue(context, cutOuts[at]!, sticker, size));
  return canvas.toDataURL('image/png');
}

/** Glues a sticker on badly: hard edges, no shadow, tilted, the size it happens to be. */
function glue(context: CanvasRenderingContext2D, image: HTMLImageElement, sticker: Sticker, size: number): void {
  const width = sticker.width * size;
  const height = width * sticker.aspect;
  context.save();
  context.translate(sticker.x * size, sticker.y * size);
  context.rotate((sticker.turn * Math.PI) / 180);
  context.drawImage(image, -width / 2, -height / 2, width, height);
  context.restore();
}
