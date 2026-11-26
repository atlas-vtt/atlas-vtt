/**
 * What a roll adds to its dice: the sum of its constants (`+ 5`), of which some
 * may carry a label (`+2[Stealth]`: a value a statblock armed for its next roll,
 * or a bare bonus named by what it was rolled for). A roll's lines show the sum
 * alone; the labels name the roll in its title. A labelled constant stays part
 * of `modifiers`, so whatever reads the sum alone (an older Atlas, a saved log,
 * the players' page) still adds up.
 */

import type { NamedModifier } from './diceFormula';
import { LABEL_CHARACTERS, LABEL_LENGTH } from './formulaTerms';

/** What a roll adds to its dice: the sum of its constants, and the labelled ones among them. */
export interface ModifierParts {
  modifiers: number;
  namedModifiers?: readonly NamedModifier[] | undefined;
}

/** A space a line never breaks at: a die's name stays with its number, a bonus with the last die. */
export const KEEP = '\u00a0';

const isNamedModifier = (entry: unknown): entry is NamedModifier => {
  const named = entry as Partial<NamedModifier> | null;
  return typeof named === 'object' && named !== null && typeof named.label === 'string' && named.label !== ''
    && typeof named.value === 'number' && Number.isFinite(named.value);
};

/** A roll's labelled modifiers, in written order; an entry a saved log holds in another shape is left out. */
export function namedModifiersOf(parts: ModifierParts): NamedModifier[] {
  const named: unknown = parts.namedModifiers;
  return Array.isArray(named) ? named.filter(isNamedModifier) : [];
}

/** The constants a roll adds without a label: its modifiers less the labelled ones. */
export function plainModifier(parts: ModifierParts): number {
  return namedModifiersOf(parts).reduce((sum, named) => sum - named.value, parts.modifiers);
}

/** ` + 3` or ` − 3`; nothing without a modifier. */
export function modifierText(modifier: number): string {
  if (modifier === 0) return '';
  return modifier > 0 ? ` + ${modifier}` : ` − ${Math.abs(modifier)}`;
}

/**
 * `modifierText` of a roll's whole modifier, for a line that wraps only between dice: it stays with the last die.
 * Labels are left out; the roll's title names them (`rollName`).
 */
export function keptModifiersText(parts: ModifierParts): string {
  return modifierText(parts.modifiers).replaceAll(' ', KEEP);
}

const NOT_IN_LABEL = new RegExp(`[^${LABEL_CHARACTERS}]+`, 'gu');

/** A label as a dice formula can hold it: other characters read as spaces, and it is cut to the formula's limit. */
export function formulaLabel(label: string): string {
  return label.replace(NOT_IN_LABEL, ' ').replace(/\s+/g, ' ').trim().slice(0, LABEL_LENGTH).trim();
}

/** A labelled constant as a formula writes it: `+2[Proficiency]`, `-1[Bane]`; `+2` alone without a label. */
export function labelledConstant({ label, value }: NamedModifier): string {
  return `${value < 0 ? '-' : '+'}${Math.abs(value)}${label ? `[${label}]` : ''}`;
}

/** A formula without the labels of its constants (`1d20+3+2[Stealth]` reads `1d20+3+2`); a label of dice stays (`2d6[fire]`). */
export function withoutConstantLabels(formula: string): string {
  return formula.replace(/(^|[+\-*/(\s])(\d+)\[[^\]]*\]/g, '$1$2');
}

/**
 * The steps a roll's modifiers click in after its dice: the plain one (named `plainLabel`) where it is not 0,
 * then each labelled one, 0 included.
 */
export function modifierSteps(parts: ModifierParts, plainLabel: string): NamedModifier[] {
  const plain = plainModifier(parts);
  const named = namedModifiersOf(parts);
  return plain === 0 ? named : [{ label: plainLabel, value: plain }, ...named];
}
