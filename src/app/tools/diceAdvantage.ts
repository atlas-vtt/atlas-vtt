/**
 * Advantage and disadvantage: what a dice set's rule for a side does to a
 * roll (`AdvantageRule`). It changes only a roll of the set's own dice, as
 * criticals look only at them: a damage roll of 2d8 under a d20 set rolls as
 * it is. Asked for both at once, they cancel.
 */

import type { AdvantageRule, AdvantageSide, RollingDice } from '../types/diceSetTypes';
import { completeFormula } from './completeFormula';
import type { DieLook } from './diceFormula';
import { checkFormula } from './formulaChecks';
import type { DiceTerm, FormulaError, FormulaNode, FormulaTerm, ParsedFormula } from './formulaTypes';

export const ADVANTAGE_SIDES: readonly AdvantageSide[] = ['advantage', 'disadvantage'];

/** The side a roll is made with when both may be asked for (Shift and Alt at once): they cancel. */
export function advantageSide(advantage: boolean, disadvantage: boolean): AdvantageSide | null {
  if (advantage === disadvantage) return null;
  return advantage ? 'advantage' : 'disadvantage';
}

/** The sides `rules` say anything for. */
export function ruledSides(rules: RollingDice): AdvantageSide[] {
  return ADVANTAGE_SIDES.filter((side) => rules[side] !== undefined);
}

const isSetTerm = (term: FormulaTerm): term is DiceTerm =>
  term.kind === 'dice' && !term.negative && !term.fate && !term.keep && !term.tally && !term.advantage;

/**
 * The index of the term that rolls the set's first die, where the terms hold
 * all of the set's dice (as criticals find them); null where they do not.
 * Terms that keep, drop or count dice of their own (`2d20kh1`) are none of them.
 */
export function setDiceTerm(terms: readonly FormulaTerm[], rules: RollingDice): number | null {
  const left = new Map<number, number>();
  for (const term of terms) if (isSetTerm(term)) left.set(term.faces, (left.get(term.faces) ?? 0) + term.count);
  for (const group of rules.dice) {
    const held = left.get(group.sides) ?? 0;
    if (held < group.count) return null;
    left.set(group.sides, held - group.count);
  }
  const first = rules.dice[0];
  const index = terms.findIndex((term) => isSetTerm(term) && term.faces === first?.sides);
  return index < 0 ? null : index;
}

/** The sides that change a roll of `formula` by `rules`: those the set has a rule for, where the roll holds the set's dice. */
export function advantageSidesFor(formula: string, rules: RollingDice): AdvantageSide[] {
  const complete = completeFormula(formula, rules);
  return complete.ok && setDiceTerm(complete.parsed.terms, rules) !== null ? ruledSides(rules) : [];
}

/** What advantage made of a roll: the terms to roll and the dice's looks, and the rules their explosions follow. */
export interface AdvantagedFormula {
  formula: ParsedFormula;
  looks: (DieLook | undefined)[];
  /** The set's rules with its first group one die larger where advantage rolls one more of it, so that die explodes too. */
  explodeRules: RollingDice;
}

/** Whether a side keeps the highest dice: advantage does, unless the set rolls under. */
const keepsHighest = (side: AdvantageSide, rules: RollingDice): boolean => (side === 'advantage') !== (rules.crit === 'roll-under');

function withKeep(term: DiceTerm, rule: Extract<AdvantageRule, { kind: 'keep' }>, side: AdvantageSide, rules: RollingDice): DiceTerm {
  const shares = rule.tensOnly === true && term.faces === 100 && term.count === 1;
  const end = keepsHighest(side, rules) ? 'highest' : 'lowest';
  return {
    ...term,
    count: term.count + 1,
    keep: { mode: 'keep', end, count: term.count, chains: true },
    ...(shares && { sharedUnits: true as const }),
  };
}

/** `node` with the term `from` in it replaced by `to`. */
function replaced(node: FormulaNode, from: FormulaTerm, to: FormulaTerm): FormulaNode {
  switch (node.kind) {
    case 'term': return node.term === from ? { kind: 'term', term: to } : node;
    case 'negate': return { kind: 'negate', operand: replaced(node.operand, from, to) };
    case 'operation': return { ...node, left: replaced(node.left, from, to), right: replaced(node.right, from, to) };
  }
}

/** The term advantage adds to the whole roll, and whether it is subtracted. */
function addedTerm(rule: Exclude<AdvantageRule, { kind: 'keep' }>, side: AdvantageSide): FormulaTerm {
  if (rule.kind === 'die') return { kind: 'dice', count: 1, faces: rule.sides, negative: side === 'disadvantage', advantage: true };
  return { kind: 'constant', value: Math.abs(rule.value), negative: (side === 'disadvantage') !== (rule.value < 0) };
}

/**
 * The roll `formula` becomes with `side`: null where the set has no rule for
 * the side or the roll holds none of the set's dice (it rolls as it is), the
 * limit it would break where advantage takes it past one.
 */
export function withAdvantage(
  formula: ParsedFormula, looks: readonly (DieLook | undefined)[], rules: RollingDice, side: AdvantageSide,
): AdvantagedFormula | FormulaError | null {
  const rule = rules[side];
  const at = rule ? setDiceTerm(formula.terms, rules) : null;
  if (!rule || at === null) return null;
  const terms = [...formula.terms];
  const diceTerms = terms.filter((term) => term.kind === 'dice').length;
  const shownLooks = Array.from({ length: diceTerms }, (_, i) => looks[i]);
  let expression = formula.expression;
  let explodeRules = rules;
  if (rule.kind === 'keep') {
    const original = terms[at] as DiceTerm;
    const kept = withKeep(original, rule, side, rules);
    terms[at] = kept;
    expression = replaced(expression, original, kept);
    const [first, ...rest] = rules.dice;
    if (first) explodeRules = { ...rules, dice: [{ ...first, count: first.count + 1 }, ...rest] };
  } else {
    const added = addedTerm(rule, side);
    terms.push(added);
    expression = { kind: 'operation', operator: added.negative ? '-' : '+', left: expression, right: { kind: 'term', term: added } };
    if (rule.kind === 'die') shownLooks.push({ ...(rule.name && { name: rule.name }), ...(rule.colour && { colour: rule.colour }) });
  }
  const problem = checkFormula(expression, terms);
  if (problem) return { ok: false, code: problem };
  return { formula: { ok: true, terms, expression, linear: formula.linear }, looks: shownLooks, explodeRules };
}
