/**
 * Saved rolls whose dice are designed as a Dice Lab set is (`DicePreset.look`): read from settings with the Dice
 * Lab's own checks, made from a plain formula or a set, rolled as a set and written out. Pure.
 */

import { cleanDiceName, parseStoredDiceSet } from '../../../gameSystems/diceSetValidation';
import { MAX_SET_DICE, MAX_SET_GROUPS, MAX_SET_SIDES, setRoll, setRollText } from '../../../gameSystems/diceSets';
import { parseFormula } from '../../../tools/parseFormula';
import type { DicePreset } from '../../../types/dicePresetTypes';
import type { DiceSet, DiceSetDie, RollingDice } from '../../../types/diceSetTypes';
import { MAX_MODIFIER } from './diceTrayPool';

/** The bonus of a designed roll: a signed number, at most as far either way as the tray's modifier. */
export const MAX_LOOK_BONUS = MAX_MODIFIER;
const BONUS = /^[+-]\d{1,3}$/;

/** The bonus a designed roll adds, as a number (0 for none). */
export const lookBonus = (preset: Pick<DicePreset, 'formula'>): number => (BONUS.test(preset.formula) ? Number(preset.formula) : 0);

/** A bonus as a designed roll stores it: `+3`, `-1`, or empty for 0. */
export function bonusText(bonus: number): string {
  const clamped = Math.max(-MAX_LOOK_BONUS, Math.min(MAX_LOOK_BONUS, Math.trunc(bonus)));
  if (clamped === 0) return '';
  return clamped > 0 ? `+${clamped}` : `${clamped}`;
}

/** A look as settings hold it, checked as a Dice Lab set's file is; null where it cannot roll or its bonus is none. */
export function readPresetLook(raw: unknown, formula: string): RollingDice | null {
  if (formula !== '' && !BONUS.test(formula)) return null;
  const set = parseStoredDiceSet({ ...(typeof raw === 'object' && raw !== null ? raw : {}), id: 'look', name: 'look' });
  if (!set || set.readOnly) return null;
  return lookOfSet(set);
}

/** What a set rolls, without what names it in the library. */
export function lookOfSet(set: RollingDice): RollingDice {
  return {
    dice: set.dice.map((die) => ({ ...die })),
    crit: set.crit,
    ...(set.explode && { explode: set.explode }),
    ...(set.advantage && { advantage: set.advantage }),
    ...(set.disadvantage && { disadvantage: set.disadvantage }),
  };
}

/**
 * The look a formula of plain dice and numbers reads as (`1d8[slashing]+3`: one d8 named Slashing, +3), or null
 * where it holds more than a look can say (keep, explode, reroll, counted or subtracted dice, `*`, `/`, Fate dice).
 */
export function lookOfFormula(formula: string): { look: RollingDice; bonus: string } | null {
  const parsed = parseFormula(formula.replaceAll('−', '-'));
  if (!parsed.ok || !parsed.linear) return null;
  const dice: DiceSetDie[] = [];
  let bonus = 0;
  for (const term of parsed.terms) {
    if (term.kind === 'constant') {
      bonus += term.negative ? -term.value : term.value;
      continue;
    }
    if (term.negative || term.fate || term.keep || term.reroll || term.explode || term.tally || term.count === 0 || term.faces > MAX_SET_SIDES) return null;
    const name = cleanDiceName(term.label);
    dice.push({ count: term.count, sides: term.faces, ...(name && { name }) });
  }
  const count = dice.reduce((sum, die) => sum + die.count, 0);
  if (dice.length === 0 || dice.length > MAX_SET_GROUPS || count > MAX_SET_DICE || Math.abs(bonus) > MAX_LOOK_BONUS) return null;
  return { look: { dice, crit: 'natural' }, bonus: bonusText(bonus) };
}

/** The set a designed roll rolls with, named after the roll; null for a roll written as a formula. */
export function presetSet(preset: DicePreset): DiceSet | null {
  return preset.look ? { id: `saved-roll:${preset.id}`, name: preset.name, builtIn: false, ...preset.look } : null;
}

/** A saved roll as a line shows it: its formula, or a designed roll's dice and bonus (`d8 + 2d6 + 3`). */
export function presetText(preset: DicePreset): string {
  if (!preset.look) return preset.formula;
  const bonus = lookBonus(preset);
  const dice = setRollText(preset.look.dice);
  if (bonus === 0) return dice;
  return `${dice} ${bonus > 0 ? '+' : '−'} ${Math.abs(bonus)}`;
}

/** The formula a saved roll's place in the row is drawn from (`presetFaceParts`): a designed roll's dice and bonus, else its formula. */
export function presetFaceFormula(preset: DicePreset): string {
  if (!preset.look) return preset.formula;
  const bonus = lookBonus(preset);
  const dice = setRoll(preset.look.dice);
  if (bonus === 0) return dice;
  return `${dice}${bonus > 0 ? '+' : ''}${bonus}`;
}
