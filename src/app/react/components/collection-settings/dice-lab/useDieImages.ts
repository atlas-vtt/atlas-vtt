import { useEffect, useState } from 'react';
import { dieImage, drawDieImages, type DieImage, type DieImageRequest } from '../../../../dice3d/dieImages';

/** A die's image: drawn, none (a die without a body, no WebGL), or not drawn yet. */
export type DieImageState = DieImage | null | undefined;

/**
 * The image of each kind of die on the tray, drawn in `doc` by the dice the map
 * throws. Kinds already drawn show at once; the others are drawn in one go and
 * the tray shows them as they arrive. Nothing is drawn while the dice stand.
 */
export function useDieImages(dice: readonly DieImageRequest[], doc: Document | null): (die: DieImageRequest) => DieImageState {
  const [, setDrawn] = useState(0);
  /** Drawing failed: the tray shows the dice it has no image of without one, instead of waiting. */
  const [failed, setFailed] = useState(false);
  // The kinds as text: a new array of the same dice draws nothing.
  const kinds = JSON.stringify([...new Set(dice.map(({ sides, colour }) => `${sides}|${colour ?? ''}`))].sort());

  useEffect(() => {
    if (!doc) return;
    const wanted = (JSON.parse(kinds) as string[]).map((kind): DieImageRequest => {
      const [sides, colour] = kind.split('|');
      return { sides: Number(sides), ...(colour && { colour }) };
    });
    if (wanted.every((die) => dieImage(die) !== undefined)) return;
    let live = true;
    void drawDieImages(wanted, doc).then(() => { if (live) setDrawn((count) => count + 1); }, () => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [kinds, doc]);

  return (die) => {
    const image = dieImage(die);
    return image === undefined && failed ? null : image;
  };
}
