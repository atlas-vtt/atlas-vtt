/**
 * What the tray's formula field holds and whether it can be rolled: checked as
 * it is typed, by the same rules a roll is checked by, before anything rolls.
 */
import { FORMULA_LIMITS, parseFormula, type FormulaError, type FormulaErrorCode } from '../../../tools/parseFormula';
import type { AdvantageSide } from '../../../types/diceSetTypes';
import type { TrayAdvantageChoice } from '../../../tools/diceTrayMemory';
import { MAX_DICE, MAX_PER_DIE, TRAY_DICE, trayDiceCount, type TrayPool } from './diceTrayPool';
import { modifierOf, parseableFormula } from './diceTrayText';
import { t } from '../../../i18n';

/** What advantage the collection's dice set offers the tray. */
export interface TrayAdvantage {
  /** The sides the set has a rule for. */
  sides: readonly AdvantageSide[];
  /** Whether a roll of `formula` holds the set's dice, which advantage changes. */
  applies: (formula: string) => boolean;
  /** The set's dice as people write them (`d20`): what advantage changes. */
  dice: string;
}

/** Whether a roll of `formula` would be refused, and why: the dice tool's own check (`DiceTool.checkRoll`). */
export type TrayCheck = (formula: string, advantage: AdvantageSide | null) => FormulaError | null;

export type TrayStatus =
  | { kind: 'empty' }
  /** A modifier and no dice: nothing to roll yet. */
  | { kind: 'no-dice'; modifier: number }
  /** Refused as written, or (`byAdvantage`) once advantage changes it. */
  | { kind: 'invalid'; formula: string; code: FormulaErrorCode; byAdvantage: boolean }
  | { kind: 'ready'; formula: string; advantage: AdvantageSide | null };

/** Whether advantage stands moot: the formula holds dice, and none it changes. */
export function advantageMoot(text: string, advantage: TrayAdvantage | undefined): boolean {
  if (!advantage) return false;
  const formula = parseableFormula(text);
  const parsed = formula === '' ? null : parseFormula(formula);
  return parsed?.ok === true && parsed.terms.some((term) => term.kind === 'dice') && !advantage.applies(formula);
}

/** The side a roll of `text` is made with: the one chosen, where advantage changes it. */
export function rollSide(text: string, choice: TrayAdvantageChoice, advantage: TrayAdvantage | undefined): AdvantageSide | null {
  return advantage && choice !== 'normal' && advantage.applies(parseableFormula(text)) ? choice : null;
}

export function trayStatus(text: string, choice: TrayAdvantageChoice, advantage: TrayAdvantage | undefined, check: TrayCheck): TrayStatus {
  const formula = parseableFormula(text);
  if (formula === '') return { kind: 'empty' };
  const parsed = parseFormula(formula);
  if (!parsed.ok) return { kind: 'invalid', formula, code: parsed.code, byAdvantage: false };
  if (!parsed.terms.some((term) => term.kind === 'dice')) return { kind: 'no-dice', modifier: modifierOf(text) };
  const plain = check(formula, null);
  if (plain) return { kind: 'invalid', formula, code: plain.code, byAdvantage: false };
  const side = rollSide(text, choice, advantage);
  const helped = side ? check(formula, side) : null;
  if (helped) return { kind: 'invalid', formula, code: helped.code, byAdvantage: true };
  return { kind: 'ready', formula, advantage: side };
}

const SIDE_LABEL: Record<AdvantageSide, () => string> = {
  advantage: () => t('dice.advantage'),
  disadvantage: () => t('dice.disadvantage'),
};

export const sideLabel = (side: AdvantageSide): string => SIDE_LABEL[side]();

// What a formula is cut into to find the part that is wrong: its terms, between operators and parentheses.
const TERM_SPLIT = /[\s+\-*/()]+/;
const SHOWN_TOKEN = 16;

/** The first term of `formula` that is refused, alone, for `code`; null where no single term is (`2d6 +`). */
function wrongTerm(formula: string, code: FormulaErrorCode): string | null {
  const term = formula.split(TERM_SPLIT).find((part) => {
    if (part === '') return false;
    const alone = parseFormula(part);
    return !alone.ok && alone.code === code;
  });
  if (!term) return null;
  return term.length > SHOWN_TOKEN ? `${term.slice(0, SHOWN_TOKEN - 1)}…` : term;
}

/** Why a formula is refused, in one short line that names the part at fault where one term is. */
function refusal(formula: string, code: FormulaErrorCode, byAdvantage: boolean): string {
  if (byAdvantage && code === 'dice') return t('diceRoll.advantageTooMany');
  const token = code === 'syntax' || code === 'faces' || code === 'modifier' ? wrongTerm(formula, code) : null;
  switch (code) {
    case 'syntax': return token ? t('diceRoll.errorToken', { token }) : t('diceRoll.errorUnfinished');
    case 'faces': return token ? t('diceRoll.errorFaces', { token, max: FORMULA_LIMITS.faces }) : t('dice.formulaError.faces');
    case 'modifier': return token ? t('diceRoll.errorModifier', { token }) : t('diceRoll.errorModifierAny');
    case 'dice': return t('diceRoll.errorDice', { max: FORMULA_LIMITS.dice });
    case 'length': return t('diceRoll.errorLength', { max: FORMULA_LIMITS.characters });
    case 'terms': return t('diceRoll.errorTerms', { max: FORMULA_LIMITS.terms });
    case 'depth': return t('diceRoll.errorDepth', { max: FORMULA_LIMITS.depth });
    case 'total': return t('diceRoll.errorTotal');
  }
}

/** Why clicks put no more dice in the tray, where they do not; null while they do. */
function limitReached(counts: TrayPool): string | null {
  if (trayDiceCount(counts) >= MAX_DICE) return t('diceRoll.limitTotal', { max: MAX_DICE });
  const full = TRAY_DICE.find((sides) => (counts[sides] ?? 0) >= MAX_PER_DIE);
  return full ? t('diceRoll.limitDie', { max: MAX_PER_DIE, sides: full }) : null;
}

/**
 * The line under the formula field: why the dice take no more, or why the formula cannot be rolled. Empty
 * otherwise: Roll says what it rolls (and its Enter mark that Enter does), the dice' tooltips explain
 * Shift-click, the choice above shows the advantage side, and a modifier without dice shows in its own field
 * while Roll stays disabled. It lies out of the flow, so nothing moves when it speaks.
 */
export function statusMessage(status: TrayStatus, counts: TrayPool = {}): string {
  switch (status.kind) {
    case 'empty':
    case 'no-dice': return '';
    case 'invalid': return refusal(status.formula, status.code, status.byAdvantage);
    case 'ready': return limitReached(counts) ?? '';
  }
}
