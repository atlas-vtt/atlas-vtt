/**
 * What a recovery button would do for a character: for each rule (the button's own, then those of
 * every action the player picked, for whom each is taken), the metric it changes as that character
 * holds it now, its formula with the resting character's numbers in, and the choice a Spend rule
 * asks for (spent from the resting character). A rule whose metric, value or formula cannot be
 * found is skipped, with the reason. Pure.
 */

import { shownCounterRows } from '../statblocks/values/counterValues';
import { wholeNumber } from '../statblocks/values/references';
import { fillFormula, type FormulaProblem } from './recoveryFormula';
import type { RecoveryAction, RecoveryButton, RecoveryRule, RecoveryTarget } from './recoveryTypes';
import { countersLeft } from './restCounters';
import { alwaysRef, pickRef, type PlannedRule, type RestCharacter, type RestMetric, type RestPick, type RestPlan, type RestSkip, type RuleRef, type SkippedRule } from './restTypes';

/** The metric a target names on the character, or why it has none. */
export function restMetric(target: RecoveryTarget, character: RestCharacter): RestMetric | RestSkip {
  switch (target.kind) {
    case 'resource': {
      const definition = character.resourceOf(target.field);
      if (!definition) return { kind: 'unknown-resource', key: target.field };
      if (definition.direction === 'static') return { kind: 'static-resource', key: target.field };
      const value = character.resourceValue(definition.key);
      if (!value) return { kind: 'no-value', key: target.field };
      return { kind: 'resource', key: definition.key, label: definition.name, definition, value };
    }
    case 'counters': {
      const field = character.fields.get(target.field);
      if (!field || field.type !== 'counters') return { kind: 'unknown-field', key: target.field };
      const value = character.fieldValue(target.field);
      if (shownCounterRows(field, value) === null) return { kind: 'unreadable-counters', key: target.field };
      return { kind: 'counters', key: target.field, label: field.label, field, rows: target.rows, value };
    }
    case 'condition': {
      const definition = character.conditions.find((each) => each.id === target.id && each.valued === true);
      if (!definition) return { kind: 'unknown-condition', id: target.id };
      const value = character.conditionValue(target.id);
      if (value === null) return { kind: 'no-token', id: target.id };
      return { kind: 'condition', id: target.id, label: definition.name, definition, value };
    }
  }
}

const isMetric = (found: RestMetric | RestSkip): found is RestMetric => found.kind === 'resource' || found.kind === 'counters' || found.kind === 'condition';

/** How a target is called where the character has no metric for it: its definition's or field's name where those exist. */
function targetLabel(target: RecoveryTarget, character: RestCharacter): string {
  switch (target.kind) {
    case 'resource': return character.resourceOf(target.field)?.name ?? character.fields.get(target.field)?.label ?? target.field;
    case 'counters': return character.fields.get(target.field)?.label ?? target.field;
    case 'condition': return character.conditions.find((each) => each.id === target.id)?.name ?? target.id;
  }
}

/** How many units a metric holds to spend: what is left of a resource or of the named counters. */
export function spendable(metric: RestMetric): number {
  switch (metric.kind) {
    case 'resource': return metric.definition.direction === 'fills' ? metric.value.max - metric.value.current : metric.value.current;
    case 'counters': return countersLeft(metric.field, metric.value, metric.rows);
    case 'condition': return 0;
  }
}

/** The number a field holds for a Set rule, or the problem that refuses it. */
function fieldNumber(field: string, character: RestCharacter): number | FormulaProblem {
  const value = character.lookup(field);
  if (value === undefined) return { kind: 'missing', field };
  return wholeNumber(value) ?? { kind: 'not-whole', field };
}

/** A rule placed in the rest: its place and reference, who acts (whose numbers its formulas read) and whose metric it changes. */
interface RuleUnit {
  readonly index: number;
  readonly ref: RuleRef;
  readonly rule: RecoveryRule;
  /** The resting character: formulas and a Spend's source are theirs. */
  readonly actor: RestCharacter;
  /** The character the rule changes; null where an action was taken for one the rest cannot reach. */
  readonly character: RestCharacter | null;
  readonly forId: string | null;
}

/** The rule planned on its target, or why it is skipped. */
function planRule(unit: RuleUnit, target: RestMetric): PlannedRule | RestSkip {
  const { index, ref, rule, actor } = unit;
  const planned = { index, ref, rule, character: unit.character!, target };
  switch (rule.does) {
    case 'amount': {
      const formula = fillFormula(rule.formula, (path) => actor.lookup(path));
      return formula.ok ? { ...planned, formula } : { kind: 'formula', problem: formula.problem };
    }
    case 'set': {
      const to = typeof rule.to === 'number' ? rule.to : fieldNumber(rule.to.field, actor);
      return typeof to === 'number' ? { ...planned, to } : { kind: 'formula', problem: to };
    }
    case 'spend': {
      const source = restMetric(rule.from, actor);
      if (!isMetric(source)) return source;
      const formula = fillFormula(rule.each, (path) => actor.lookup(path));
      if (!formula.ok) return { kind: 'formula', problem: formula.problem };
      const max = Math.min(spendable(source), rule.most ?? Number.POSITIVE_INFINITY);
      return { ...planned, source, formula, spend: { label: source.label, max: Math.max(0, max), each: formula.formula } };
    }
    default:
      return planned;
  }
}

/** Finds another player character an action is taken for, by its id; null where the rest cannot reach it. */
export type AllyLookup = (id: string) => RestCharacter | null;

const NO_ALLIES: AllyLookup = () => null;

/** The action a pick names, or null where its button has no such step or action. */
export function pickedAction(button: RecoveryButton, pick: RestPick): RecoveryAction | null {
  const choice = button.choices?.find((each) => each.id === pick.choice);
  return choice?.actions.find((each) => each.id === pick.action) ?? null;
}

/** Every rule of the rest in the order it applies: the button's own, then each pick's action, for whom it is taken. */
function ruleUnits(button: RecoveryButton, character: RestCharacter, picks: readonly RestPick[], allies: AllyLookup): RuleUnit[] {
  const units: RuleUnit[] = button.rules.map((rule, at) => ({ index: at, ref: alwaysRef(at), rule, actor: character, character, forId: null }));
  picks.forEach((pick, at) => {
    const action = pickedAction(button, pick);
    if (!action) return;
    // Only an action taken for others reaches anyone else; one for oneself is the resting character's whoever it names
    const other = pick.for !== null && pick.for !== character.id && action.forOthers === true ? pick.for : null;
    const target = other === null ? character : allies(other);
    action.rules.forEach((rule, ruleAt) => {
      units.push({ index: units.length, ref: pickRef(at, ruleAt), rule, actor: character, character: target, forId: other });
    });
  });
  return units;
}

/**
 * What pressing `button` would do for `character` with the actions `picks` names (each for the
 * character itself, or for one `allies` finds): its rules in order, each planned or skipped.
 */
export function restPlan(button: RecoveryButton, character: RestCharacter, picks: readonly RestPick[] = [], allies: AllyLookup = NO_ALLIES): RestPlan {
  const rules: PlannedRule[] = [];
  const skipped: SkippedRule[] = [];
  for (const unit of ruleUnits(button, character, picks, allies)) {
    const skip = (label: string, reason: RestSkip): void => { skipped.push({ index: unit.index, ref: unit.ref, rule: unit.rule, label, reason }); };
    if (unit.character === null) {
      // No label: the id is Atlas's own, never something to show anyone
      skip('', { kind: 'unknown-ally', id: unit.forId ?? '' });
      continue;
    }
    const target = restMetric(unit.rule.target, unit.character);
    const planned = isMetric(target) ? planRule(unit, target) : target;
    if ('rule' in planned) rules.push(planned);
    else skip(isMetric(target) ? target.label : targetLabel(unit.rule.target, unit.character), planned);
  }
  return { button, rules, skipped };
}
