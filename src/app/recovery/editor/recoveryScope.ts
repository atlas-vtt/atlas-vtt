/**
 * What the recovery editor's card edits of a button: the rules it always applies, or those of one
 * action of one of its steps. Every rule edit goes through a scope, so spots, badges and the rule
 * card treat an action's rules exactly as a button's. Pure.
 */

import type { RecoveryAction, RecoveryButton, RecoveryChoice, RecoveryRule } from '../recoveryTypes';

/** The button's own rules, or one action's, by the ids of its step and itself. */
export type RuleScope = { kind: 'always' } | { kind: 'action'; choice: string; action: string };

export const ALWAYS: RuleScope = { kind: 'always' };

const NO_RULES: readonly RecoveryRule[] = [];

/** A scope as a string, for keys. */
export function scopeKey(scope: RuleScope): string {
  return scope.kind === 'always' ? 'always' : `action:${scope.choice}:${scope.action}`;
}

/** The step and action a scope names on a button; null for Always, or where either is gone. */
export function scopeAction(button: RecoveryButton, scope: RuleScope): { choice: RecoveryChoice; action: RecoveryAction } | null {
  if (scope.kind === 'always') return null;
  const choice = button.choices?.find((each) => each.id === scope.choice);
  const action = choice?.actions.find((each) => each.id === scope.action);
  return choice && action ? { choice, action } : null;
}

/** The scope as it stands on the button: an action that is gone gives way to Always. */
export function resolveScope(button: RecoveryButton | null, scope: RuleScope): RuleScope {
  return button && scopeAction(button, scope) ? scope : ALWAYS;
}

/** The rules a scope holds; none where its action is gone. */
export function rulesOf(button: RecoveryButton, scope: RuleScope): readonly RecoveryRule[] {
  if (scope.kind === 'always') return button.rules;
  return scopeAction(button, scope)?.action.rules ?? NO_RULES;
}

/** The button with the scope's rules replaced; the button as it is where the scope's action is gone. */
export function withScopeRules(button: RecoveryButton, scope: RuleScope, rules: RecoveryRule[]): RecoveryButton {
  if (scope.kind === 'always') return { ...button, rules };
  if (!scopeAction(button, scope)) return button;
  return withEachAction(button, (action, choice) => (choice.id === scope.choice && action.id === scope.action ? { ...action, rules } : action));
}

/** The button with `change` applied to every action of every step; a button without steps as it is. */
export function withEachAction(button: RecoveryButton, change: (action: RecoveryAction, choice: RecoveryChoice) => RecoveryAction): RecoveryButton {
  if (!button.choices) return button;
  return {
    ...button,
    choices: button.choices.map((choice) => ({ ...choice, actions: choice.actions.map((action) => change(action, choice)) })),
  };
}

/** The name the scope goes by: the button's for Always, else its action's. */
export function scopeName(button: RecoveryButton, scope: RuleScope): string {
  return scopeAction(button, scope)?.action.name ?? button.name;
}
