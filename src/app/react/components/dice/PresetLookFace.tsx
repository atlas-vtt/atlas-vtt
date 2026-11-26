import React, { useCallback, useState } from 'react';
import type { DicePreset } from '../../../types/dicePresetTypes';
import { DieStill } from '../collection-settings/dice-lab/DieStill';
import { useDieImages } from '../collection-settings/dice-lab/useDieImages';
import { presetFaceFormula } from './presetLook';
import { presetFaceParts } from './presetFace';

/** The height a designed roll's die is drawn at on its place, as the row's pencil dice are. */
const STILL_HEIGHT = 32;

/**
 * A designed saved roll on its place in the row: its first die as the dice the map throws draw it, in its colour,
 * with the row's marks: how many of it at the top left, what else the roll adds at the bottom right.
 */
export function PresetLookFace({ preset }: { preset: DicePreset & { look: NonNullable<DicePreset['look']> } }): React.ReactElement {
  const [doc, setDoc] = useState<Document | null>(null);
  const holder = useCallback((element: HTMLElement | null): void => setDoc(element?.ownerDocument ?? null), []);
  const first = preset.look.dice[0]!;
  const image = useDieImages([{ sides: first.sides, ...(first.colour && { colour: first.colour }) }], doc);
  const parts = presetFaceParts(presetFaceFormula(preset));
  return (
    <span ref={holder} className="atlas-preset-face" aria-hidden="true">
      <DieStill sides={first.sides} colour={first.colour} image={image({ sides: first.sides, ...(first.colour && { colour: first.colour }) })} height={STILL_HEIGHT} />
      {first.count > 1 && <span className="atlas-preset-face__mark atlas-preset-face__mark--count">{`${first.count}×`}</span>}
      {parts && parts.rest !== '' && <span className="atlas-preset-face__mark atlas-preset-face__mark--rest">{parts.rest}</span>}
    </span>
  );
}
