/**
 * How a roll writes what it adds to its dice: the sum of its constants
 * (`+ 3`), then each labelled one as a term of its own (`+ 2 Stealth`): the
 * values a statblock armed for its next roll ("Add to next roll"). A labelled
 * constant stays part of `modifiers`, so whatever reads the sum alone (an older
 * Atlas, a saved log, the players' page) still adds up.
 */

import type { NamedModifier } from './diceFormula';

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

/** ` + 2 Proficiency` or ` − 1 Bane`: a labelled modifier as a term of its own, also where it is 0, `space` between its parts. */
function namedTerm({ label, value }: NamedModifier, space = ' '): string {
  return ` ${value < 0 ? '−' : '+'}${space}${Math.abs(value)}${space}${space === ' ' ? label : label.replaceAll(' ', space)}`;
}

/** ` + 3 + 2 Stealth`: the plain constants, then each labelled one by its label; nothing without a modifier. */
export function modifiersText(parts: ModifierParts): string {
  return modifierText(plainModifier(parts)) + namedModifiersOf(parts).map((term) => namedTerm(term)).join('');
}

/**
 * `modifiersText` for a line that wraps only between dice: the plain modifier stays with the last die, and a
 * labelled one breaks only before its sign (` +\u00a02\u00a0Stealth`).
 */
export function keptModifiersText(parts: ModifierParts): string {
  return modifierText(plainModifier(parts)).replaceAll(' ', KEEP) + namedModifiersOf(parts).map((term) => namedTerm(term, KEEP)).join('');
}

/** A labelled constant as a formula writes it: `+2[Proficiency]`, `-1[Bane]`; `+2` alone without a label. */
export function labelledConstant({ label, value }: NamedModifier): string {
  return `${value < 0 ? '-' : '+'}${Math.abs(value)}${label ? `[${label}]` : ''}`;
}

/**
 * A formula whose labelled constants close it (`1d20+3+2[Stealth]`, as a statblock adds its armed values)
 * with them written as terms of their own: `1d20+3 + 2 Stealth`, each breaking only before its sign. The
 * formula as it is where it does not end in the roll's labelled constants.
 */
export function formulaWithNamedTerms(result: { formula: string } & ModifierParts): string {
  const named = namedModifiersOf(result);
  const written = named.map(labelledConstant).join('');
  if (named.length === 0 || !result.formula.endsWith(written)) return result.formula;
  return result.formula.slice(0, -written.length) + named.map((term) => namedTerm(term, KEEP)).join('');
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
