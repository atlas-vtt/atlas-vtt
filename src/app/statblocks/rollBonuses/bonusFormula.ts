/**
 * A statblock's roll with the values armed for it ("Add to next roll"): each
 * added after the formula as a labelled constant (`1d20+5+2[Proficiency]`),
 * which the roll keeps apart from its other constants
 * (`DiceRollResult.namedModifiers`). The formula is checked as a whole when it
 * is rolled, so a value that takes it past a limit refuses the roll. Pure.
 */

import { LABEL_CHARACTERS, LABEL_LENGTH } from '../../tools/formulaTerms';
import { labelledConstant } from '../../tools/namedModifiers';
import type { ArmableValues } from './armableValues';
import type { ArmedBonus } from './armedBonuses';

const NOT_IN_LABEL = new RegExp(`[^${LABEL_CHARACTERS}]+`, 'gu');

/** A label as a dice formula can hold it: other characters read as spaces, and it is cut to the formula's limit. */
export function formulaLabel(label: string): string {
  return label.replace(NOT_IN_LABEL, ' ').replace(/\s+/g, ' ').trim().slice(0, LABEL_LENGTH).trim();
}

/** The armed ids the card shows a value for, as the roll adds them, in the order they were armed. */
export function armedValues(ids: readonly string[], shown: ArmableValues): ArmedBonus[] {
  return ids.flatMap((id) => {
    const value = shown.get(id);
    return value ? [{ id, ...value }] : [];
  });
}

/** `formula` with every armed value added after it; a label that holds nothing a formula can write adds the number alone. */
export function withArmedBonuses(formula: string, armed: readonly ArmedBonus[]): string {
  return formula + armed.map(({ label, value }) => labelledConstant({ label: formulaLabel(label), value })).join('');
}
