import React, { useCallback, useState } from 'react';
import { MAX_SET_GROUPS } from '../../../gameSystems/diceSets';
import { parseFormula } from '../../../tools/parseFormula';
import { writtenSide } from '../../../tools/writtenAdvantage';
import type { DicePreset } from '../../../types/dicePresetTypes';
import type { DiceSetDie } from '../../../types/diceSetTypes';
import { DieStill } from '../collection-settings/dice-lab/DieStill';
import { useDieImages } from '../collection-settings/dice-lab/useDieImages';

/** The height the dice are drawn at on a card, as the row's designed rolls are. */
const STILL_HEIGHT = 32;

/** The kinds of dice a roll throws, in its order: a designed roll's groups in their colours, a formula's dice terms. */
function rollDice(preset: Pick<DicePreset, 'formula' | 'look'>): DiceSetDie[] {
  if (preset.look) return preset.look.dice.slice(0, MAX_SET_GROUPS);
  const parsed = parseFormula(writtenSide(preset.formula.replaceAll('−', '-')).formula);
  if (!parsed.ok) return [];
  return parsed.terms.flatMap((term) => (term.kind === 'dice' && !term.fate ? [{ count: term.count, sides: term.faces }] : [])).slice(0, MAX_SET_GROUPS);
}

/** A saved roll's dice as the map throws them, one per kind, overlapping a little: the card's picture of its roll. */
export function PresetDice({ preset }: { preset: Pick<DicePreset, 'formula' | 'look'> }): React.ReactElement | null {
  const [doc, setDoc] = useState<Document | null>(null);
  const holder = useCallback((element: HTMLElement | null): void => setDoc(element?.ownerDocument ?? null), []);
  const dice = rollDice(preset);
  const kinds = dice.map(({ sides, colour }) => ({ sides, ...(colour && { colour }) }));
  const image = useDieImages(kinds, doc);
  if (dice.length === 0) return null;
  return (
    <span ref={holder} className="atlas-dice-presets__dice" aria-hidden="true">
      {kinds.map((kind, index) => <DieStill key={index} sides={kind.sides} colour={kind.colour} image={image(kind)} height={STILL_HEIGHT} />)}
    </span>
  );
}
