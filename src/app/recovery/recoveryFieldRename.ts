/**
 * Recovery buttons follow a template field renamed in the template (`renameFieldKey`): every rule
 * that names the field (what it restores, what it spends, the field a Set takes its number from)
 * names the new key. Formulas keep their `@` references: a field's former keys still resolve. Pure.
 */

import type { FieldKey } from '../statblocks/model/templateTypes';
import type { RecoveryButton, RecoveryRule, ResourceOrCounters } from './recoveryTypes';

function renamedTarget<T extends ResourceOrCounters>(target: T, from: FieldKey, to: FieldKey): T {
  return target.field === from ? { ...target, field: to } : target;
}

function renamedRule(rule: RecoveryRule, from: FieldKey, to: FieldKey): RecoveryRule {
  if (rule.does === 'step' || rule.does === 'clear') return rule;
  const target = renamedTarget(rule.target, from, to);
  if (rule.does === 'spend') return { ...rule, target, from: renamedTarget(rule.from, from, to) };
  if (rule.does === 'set' && typeof rule.to !== 'number' && rule.to.field === from) return { ...rule, target, to: { field: to } };
  return target === rule.target ? rule : { ...rule, target };
}

/** The buttons with every rule naming the field `from` naming `to`. */
export function recoveryWithFieldRenamed(buttons: readonly RecoveryButton[], from: FieldKey, to: FieldKey): RecoveryButton[] {
  const rules = (list: readonly RecoveryRule[]): RecoveryRule[] => list.map((rule) => renamedRule(rule, from, to));
  return buttons.map((button) => ({
    ...button,
    rules: rules(button.rules),
    ...(button.choices && {
      choices: button.choices.map((choice) => ({ ...choice, actions: choice.actions.map((action) => ({ ...action, rules: rules(action.rules) })) })),
    }),
  }));
}
