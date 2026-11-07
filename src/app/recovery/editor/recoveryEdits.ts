/**
 * The edits the recovery editor makes to a template's buttons: add, rename, move and remove a
 * button, and set or remove the one rule a button (or one of its actions, by scope) has for a
 * metric. Every edit returns new values and leaves its input alone; one that would pass a limit
 * returns null. Pure.
 */

import {
  MAX_RECOVERY_BUTTONS,
  MAX_RECOVERY_RULES,
  type ConditionTarget,
  type RecoveryButton,
  type RecoveryRule,
  type RecoveryRuleKind,
  type RecoveryTarget,
  type ResourceOrCounters,
} from '../recoveryTypes';
import { metricKey } from './recoveryMetrics';
import { ALWAYS, rulesOf, withEachAction, withScopeRules, type RuleScope } from './recoveryScope';

/** An id `<prefix>-xxxxxx` none of `taken` has: it names what it is given to for good, whatever it is renamed to. */
export function newRecoveryId(prefix: string, taken: readonly { id: string }[], random: () => number = Math.random): string {
  const ids = new Set(taken.map((each) => each.id));
  for (;;) {
    const id = `${prefix}-${Math.floor(random() * 36 ** 6).toString(36).padStart(6, '0')}`;
    if (!ids.has(id)) return id;
  }
}

/** An id no button of `taken` has. */
export function newButtonId(taken: readonly RecoveryButton[], random: () => number = Math.random): string {
  return newRecoveryId('rest', taken, random);
}

/** The buttons with a new one named `name` at their end; null where the template has as many as it may. */
export function withAddedButton(buttons: readonly RecoveryButton[], name: string, id: string): RecoveryButton[] | null {
  if (buttons.length >= MAX_RECOVERY_BUTTONS) return null;
  return [...buttons, { id, name: name.trim(), rules: [] }];
}

export function withRenamedButton(buttons: readonly RecoveryButton[], id: string, name: string): RecoveryButton[] {
  return buttons.map((button) => (button.id === id ? { ...button, name: name.trim() } : button));
}

/** The buttons in a new order, by id; ids it does not hold keep their place after those named. */
export function withButtonOrder(buttons: readonly RecoveryButton[], order: readonly string[]): RecoveryButton[] {
  const byId = new Map(buttons.map((button) => [button.id, button]));
  const named = order.flatMap((id) => byId.get(id) ?? []);
  return [...named, ...buttons.filter((button) => !order.includes(button.id))];
}

/** The button `id` moved by `step` places, as far as the ends allow. */
export function withButtonMoved(buttons: readonly RecoveryButton[], id: string, step: number): RecoveryButton[] {
  const from = buttons.findIndex((button) => button.id === id);
  if (from < 0) return [...buttons];
  const to = Math.max(0, Math.min(buttons.length - 1, from + step));
  const next = [...buttons];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved!);
  return next;
}

/** The rule without the button `id` among the rows it restores (counters only). */
function withoutRow(rule: RecoveryRule, id: string): RecoveryRule {
  if (rule.target.kind !== 'counters' || rule.target.rows === 'all' || !rule.target.rows.includes(id)) return rule;
  return { ...rule, target: { ...rule.target, rows: rule.target.rows.filter((row) => row !== id) } } as RecoveryRule;
}

/**
 * The buttons without `id`. Counters rules that restored the rows set to it, the buttons' own and
 * their actions', no longer name it, so no rule points at a button that is gone.
 */
export function withoutButton(buttons: readonly RecoveryButton[], id: string): RecoveryButton[] {
  return buttons.filter((button) => button.id !== id).map((button) => withEachAction(
    { ...button, rules: button.rules.map((rule) => withoutRow(rule, id)) },
    (action) => ({ ...action, rules: action.rules.map((rule) => withoutRow(rule, id)) }),
  ));
}

/** The rule a scope of the button has for a metric; a counters rule matches its field, whatever rows it restores. */
export function ruleFor(button: RecoveryButton, target: RecoveryTarget, scope: RuleScope = ALWAYS): RecoveryRule | undefined {
  const key = metricKey(target);
  return rulesOf(button, scope).find((rule) => metricKey(rule.target) === key);
}

/**
 * The button with `rule` in place of the one the scope had for the same metric, or after the
 * others; null where the scope would hold more rules than it may.
 */
export function withRule(button: RecoveryButton, rule: RecoveryRule, scope: RuleScope = ALWAYS): RecoveryButton | null {
  const key = metricKey(rule.target);
  const had = rulesOf(button, scope);
  const at = had.findIndex((other) => metricKey(other.target) === key);
  if (at < 0 && had.length >= MAX_RECOVERY_RULES) return null;
  const rules = at < 0 ? [...had, rule] : had.map((other, index) => (index === at ? rule : other));
  return withScopeRules(button, scope, rules);
}

export function withoutRule(button: RecoveryButton, target: RecoveryTarget, scope: RuleScope = ALWAYS): RecoveryButton {
  const key = metricKey(target);
  return withScopeRules(button, scope, rulesOf(button, scope).filter((rule) => metricKey(rule.target) !== key));
}

/** Whether a metric takes a kind of rule: a condition only steps and clears, the others never do. */
export function kindFits(kind: RecoveryRuleKind, target: RecoveryTarget): boolean {
  const onCondition = kind === 'step' || kind === 'clear';
  return onCondition === (target.kind === 'condition');
}

/** The rule a metric gets when it is added: back to full, or a condition one step down. */
export function firstRule(target: RecoveryTarget): RecoveryRule {
  return target.kind === 'condition' ? { target, does: 'step', by: -1 } : { target, does: 'full' };
}

/**
 * The rule of `kind` on a metric, keeping what the rule it had says where the kind takes it (a
 * minimum, a formula); undefined for Spend, which needs a metric to spend first.
 */
export function ruleOfKind(kind: RecoveryRuleKind, target: RecoveryTarget, had?: RecoveryRule): RecoveryRule | undefined {
  if (target.kind === 'condition') return conditionRule(kind, target, had);
  const min = had && (had.does === 'amount' || had.does === 'share') ? had.min : undefined;
  const keptMin = min === undefined ? {} : { min };
  switch (kind) {
    case 'full': return { target, does: 'full' };
    case 'amount': return { target, does: 'amount', formula: had?.does === 'amount' ? had.formula : '1', ...keptMin };
    case 'share': return had?.does === 'share' ? had : { target, does: 'share', share: 0.5, round: 'down', ...keptMin };
    case 'set': return had?.does === 'set' ? had : { target, does: 'set', to: 0 };
    case 'spend': return had?.does === 'spend' ? had : undefined;
    default: return undefined;
  }
}

function conditionRule(kind: RecoveryRuleKind, target: ConditionTarget, had?: RecoveryRule): RecoveryRule | undefined {
  if (kind === 'clear') return { target, does: 'clear' };
  if (kind === 'step') return had?.does === 'step' ? had : { target, does: 'step', by: -1 };
  return undefined;
}

/** A Spend rule on `target` that spends `from`, each unit adding `each`. */
export function spendRule(target: ResourceOrCounters, from: ResourceOrCounters, had?: RecoveryRule): RecoveryRule {
  const each = had?.does === 'spend' ? had.each : '1';
  const most = had?.does === 'spend' ? had.most : undefined;
  return { target, does: 'spend', from, each, ...(most !== undefined && { most }) };
}

/** The rule with its target's rows set (counters only); other rules as they are. */
export function withRows(rule: RecoveryRule, rows: 'all' | readonly string[]): RecoveryRule {
  if (rule.target.kind !== 'counters') return rule;
  return { ...rule, target: { ...rule.target, rows } } as RecoveryRule;
}
