/**
 * What a planned rest changes: each rule applied in order to the values as the rules before it left
 * them, rolls made through the given roller (a formula without dice is worked out, never rolled),
 * every value kept within 0 and its maximum. "Restore" moves a resource towards its good end: up for
 * one that drains, down for one that fills. Pure but for the roller.
 */

import type { ResourceValue } from '../resources/resourceTypes';
import type { FieldValue } from '../statblocks/model/templateTypes';
import { restoreCounters, restoresRow } from '../statblocks/values/counterRestore';
import { shownCounterRows } from '../statblocks/values/counterValues';
import { computeFormula, type FilledFormula } from './recoveryFormula';
import { regainedRows, rowsLeftAt, sharedRows } from './restCounters';
import { spendable } from './restPlan';
import { metricChanges, type Ledger } from './restLedger';
import type { PlannedRule, RestChange, RestCharacter, RestChoices, RestMetric, RestOutcome, RestPlan, RestRoll, RestRoller, RestSkip, SkippedRule } from './restTypes';
import { spendFormula } from './spendFormula';

type Gain = { gain: number; roll: RestRoll | null } | RestSkip;

/** What a formula comes to: rolled where it holds dice, worked out where it holds none. */
function worked(formula: FilledFormula, label: string, roll: RestRoller): { total: number; roll: RestRoll | null } | RestSkip {
  if (!formula.dice) return { total: computeFormula(formula.parsed), roll: null };
  const rolled = roll(formula.formula, label);
  return rolled ? { total: rolled.total, roll: rolled } : { kind: 'roll', formula: formula.formula };
}

const restored = (value: ResourceValue, direction: 'drains' | 'fills', gain: number): number => value.current + (direction === 'drains' ? gain : -gain);
const clamped = (value: ResourceValue, current: number): ResourceValue => ({ max: value.max, current: Math.max(0, Math.min(value.max, current)) });

/** A resource after a rule. */
function nextResource(planned: PlannedRule, value: ResourceValue, direction: 'drains' | 'fills', gain: number): ResourceValue {
  const { rule } = planned;
  switch (rule.does) {
    case 'full': return clamped(value, direction === 'drains' ? value.max : 0);
    case 'set': return clamped(value, planned.to ?? value.current);
    case 'share': {
      const share = rule.round === 'down' ? Math.floor(rule.share * value.max) : Math.ceil(rule.share * value.max);
      return clamped(value, restored(value, direction, Math.max(rule.min ?? 0, share)));
    }
    default: return clamped(value, restored(value, direction, gain));
  }
}

type Regain = (formula: string, flavor: string) => number | null;
type CountersMetric = Extract<RestMetric, { kind: 'counters' }>;

/**
 * A Counters field after a rule (`next` null where it does not change), or the formula of a row's own
 * regained uses that could not be rolled. `regain` rolls those for Full.
 */
function nextCounters(planned: PlannedRule, metric: CountersMetric, gain: number, regain: Regain, restName: string): { next: FieldValue | null } | RestSkip {
  const { rule } = planned;
  const { field, value, rows } = metric;
  switch (rule.does) {
    case 'full': {
      let failed = '';
      const back = restoreCounters([{ field, value }], rows, (formula, flavor) => {
        failed = formula;
        return regain(formula, flavor);
      }, restName);
      return back === null ? { kind: 'roll', formula: failed } : { next: back[0]?.next ?? null };
    }
    case 'set': return { next: rowsLeftAt(field, value, rows, planned.to ?? 0) };
    case 'share': return { next: sharedRows(field, value, rows, rule.share, rule.round, rule.min ?? 0) };
    default: return { next: regainedRows(field, value, rows, gain) };
  }
}

/** What an Amount or Spend rule gives, or why it gives nothing; a Spend takes from the resting character (`actor`). */
function gainOf(planned: PlannedRule, choices: RestChoices, actor: Ledger, roll: RestRoller, restName: string): Gain {
  const { rule, formula, target } = planned;
  if (rule.does === 'amount' && formula) {
    const result = worked(formula, `${target.label} (${restName})`, roll);
    return 'total' in result ? { gain: Math.max(rule.min ?? 0, result.total, 0), roll: result.roll } : result;
  }
  if (rule.does !== 'spend' || !formula || !planned.source) return { gain: 0, roll: null };
  const units = Math.min(Math.max(0, Math.trunc(choices.spends.get(planned.ref) ?? 0)), planned.spend?.max ?? 0, spendable(actor.current(planned.source)));
  if (units === 0) return { gain: 0, roll: null };
  const combined = spendFormula(formula, units);
  if (!combined.ok) return { kind: 'formula', problem: combined.problem };
  const result = worked(combined, `${planned.source.label} (${restName})`, roll);
  if (!('total' in result)) return result;
  actor.spend(planned.source, units);
  return { gain: Math.max(0, result.total), roll: result.roll };
}

/** Applies one rule to its character's ledger; the reason where it changed nothing it was meant to. */
function applyRule(planned: PlannedRule, choices: RestChoices, ledgers: Ledgers, roll: RestRoller, restName: string): RestSkip | null {
  const { rule } = planned;
  const ledger = ledgers.of(planned.character);
  const target = ledger.current(planned.target);
  if (target.kind === 'condition') {
    const to = rule.does === 'step' ? Math.max(0, target.value + rule.by) : 0;
    ledger.setCondition(target, to);
    return null;
  }
  const gain = gainOf(planned, choices, ledgers.actor, roll, restName);
  if (!('gain' in gain)) return gain;
  if (rule.does === 'spend' && gain.gain === 0 && gain.roll === null) return null;
  if (target.kind === 'resource') {
    const direction = target.definition.direction === 'fills' ? 'fills' : 'drains';
    ledger.setResource(target, nextResource(planned, target.value, direction, gain.gain), gain.roll);
    return null;
  }
  // Full rolls each row's own regained formula, in the order of the rows it restores (`restoreCounters`).
  const rolling = (shownCounterRows(target.field, target.value) ?? []).flatMap((row, index) => (row.used > 0 && row.regain !== null && restoresRow(target.rows, row) ? [index] : []));
  const rowRolls = new Map<number, RestRoll>();
  const regain: Regain = (formula, flavor) => {
    const rolled = roll(formula, flavor);
    const row = rolling.shift();
    if (rolled && row !== undefined) rowRolls.set(row, rolled);
    return rolled?.total ?? null;
  };
  const counters = nextCounters(planned, target, gain.gain, regain, restName);
  if (!('next' in counters)) return counters;
  const shared = gain.roll ? [gain.roll] : [];
  if (counters.next !== null) ledger.setCounters(target, counters.next, (row) => [...shared, ...(rowRolls.has(row) ? [rowRolls.get(row)!] : [])]);
  return null;
}

/** The ledger of each character a rest changes, the resting one (`actor`) first. */
interface Ledgers {
  readonly actor: Ledger;
  of(character: RestCharacter): Ledger;
  outcome(): Omit<RestOutcome, 'skipped'>;
}

function restLedgers(actor: RestCharacter): Ledgers {
  let touched = 0;
  const next = (): number => touched++;
  const byId = new Map<string, Ledger>([[actor.id, metricChanges(actor, next)]]);
  return {
    actor: byId.get(actor.id)!,
    of: (character) => {
      let ledger = byId.get(character.id);
      if (!ledger) byId.set(character.id, ledger = metricChanges(character, next));
      return ledger;
    },
    outcome: () => {
      // Only characters the rest changed: the resting one may have changed nobody but an ally
      const outcomes = [...byId].map(([id, ledger]) => [id, ledger.outcome()] as const).filter(([, outcome]) => outcome.changes.length > 0);
      const changes = outcomes.flatMap(([, outcome]) => outcome.changes).sort((a, b) => a.order - b.order).map(({ order: _order, ...change }): RestChange => change);
      const byCharacter = new Map(outcomes.map(([id, { resources, counters, conditions }]) => [id, { resources, counters, conditions }]));
      return { changes, byCharacter };
    },
  };
}

/**
 * The changes `plan` makes with the player's `choices`, rolling through `roll`: each rule on its
 * character's values as the rules before it left them. A rule whose formula cannot be rolled, or
 * whose spend does not fit one roll, is skipped with the plan's skipped rules.
 */
export function restOutcome(plan: RestPlan, actor: RestCharacter, choices: RestChoices, roll: RestRoller): RestOutcome {
  const ledgers = restLedgers(actor);
  const skipped: SkippedRule[] = [...plan.skipped];
  for (const planned of plan.rules) {
    const reason = applyRule(planned, choices, ledgers, roll, plan.button.name);
    if (reason) skipped.push({ index: planned.index, ref: planned.ref, rule: planned.rule, label: planned.target.label, reason });
  }
  skipped.sort((a, b) => a.index - b.index);
  return { ...ledgers.outcome(), skipped };
}
