/** What the lab calls a die: on the tray, and for screen readers ("Sun, d12, gold"). */

import { DICE_SET_COLOURS } from '../../../../gameSystems/diceSets';
import { t } from '../../../../i18n';
import type { LabDie } from './labDice';

export const notation = (sides: number): string => `d${sides}`;

/** A colour's name in the palette, else its code; a die without one has the dice look. */
export function colourName(colour: string | undefined): string {
  if (colour === undefined) return t('diceLab.noColour');
  return DICE_SET_COLOURS.find(({ value }) => value === colour.toLowerCase())?.label ?? colour;
}

/** A die's name, or its sides where it has none: `Sun`, `d12`. */
export function dieTitle(die: Pick<LabDie, 'name' | 'sides'>): string {
  return die.name.trim() || notation(die.sides);
}

/** A die as a screen reader says it: `Sun, d12, gold`; `d20, dice look`. */
export function spokenDie(die: Pick<LabDie, 'name' | 'sides' | 'colour'>): string {
  const parts = [die.name.trim(), notation(die.sides), colourName(die.colour).toLocaleLowerCase()].filter(Boolean);
  return parts.join(', ');
}
