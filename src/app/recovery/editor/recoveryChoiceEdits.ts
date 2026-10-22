/**
 * The edits the recovery editor makes to a button's steps and their actions: add and remove them,
 * name them, and set how many picks a step takes. Every edit keeps the button as `parseRecovery`
 * reads it whole: a step has at least one action, takes `min` to `max` picks with `min <= max`, and
 * without repeats never more picks than it has actions; optional keys are left out rather than
 * stored empty, and a button left with no step has no `choices`. One that would pass a limit
 * returns null. Pure.
 */

import {
  MAX_ACTION_PICKS,
  MAX_RECOVERY_ACTIONS,
  MAX_RECOVERY_CHOICES,
  type RecoveryAction,
  type RecoveryButton,
  type RecoveryChoice,
} from '../recoveryTypes';
import { newRecoveryId } from './recoveryEdits';
import type { RuleScope } from './recoveryScope';

/** Exactly n picks (`min` = `max`), or up to n (`min` 0). */
export type PickMode = 'exactly' | 'upTo';

/** A new thing of the editor, with the scope of the action it brought along. */
export interface Added {
  button: RecoveryButton;
  scope: Extract<RuleScope, { kind: 'action' }>;
}

export function pickMode(choice: RecoveryChoice): PickMode {
  return choice.min === choice.max ? 'exactly' : 'upTo';
}

/** The most picks the step may ask for: one per action unless an action may be picked again. */
export function mostPicks(choice: Pick<RecoveryChoice, 'repeat' | 'actions'>): number {
  return choice.repeat ? MAX_ACTION_PICKS : Math.min(MAX_ACTION_PICKS, choice.actions.length);
}

/** The step with its counts brought within what it may ask for; the step itself where they are. */
export function clampedPicks(choice: RecoveryChoice): RecoveryChoice {
  const max = Math.max(1, Math.min(choice.max, mostPicks(choice)));
  const min = Math.min(choice.min, max);
  return max === choice.max && min === choice.min ? choice : { ...choice, min, max };
}

/** The step taking exactly `count` picks, or up to `count`, within 1 and what it may ask for. */
export function withPicks(choice: RecoveryChoice, mode: PickMode, count: number): RecoveryChoice {
  const max = Math.max(1, Math.min(Math.round(count), mostPicks(choice)));
  return { ...choice, min: mode === 'exactly' ? max : 0, max };
}

/** The step letting an action be picked again, or not (its counts then capped at its actions). */
export function withRepeat(choice: RecoveryChoice, on: boolean): RecoveryChoice {
  const { repeat: _was, ...rest } = choice;
  return clampedPicks(on ? { ...rest, repeat: true } : rest);
}

/** The step asking `prompt`; as it was where the prompt is blank, which no step may be. */
export function withPrompt(choice: RecoveryChoice, prompt: string): RecoveryChoice {
  return prompt.trim() === '' ? choice : { ...choice, prompt: prompt.trim() };
}

/** The action named `name`; as it was where the name is blank. */
export function withActionName(action: RecoveryAction, name: string): RecoveryAction {
  return name.trim() === '' ? action : { ...action, name: name.trim() };
}

/** The action with its sentence for the player; a blank one removes it. */
export function withActionText(action: RecoveryAction, text: string): RecoveryAction {
  const { text: _was, ...rest } = action;
  return text.trim() === '' ? rest : { ...rest, text: text.trim() };
}

/** The action that may be taken for another player character too, or for oneself only. */
export function withForOthers(action: RecoveryAction, on: boolean): RecoveryAction {
  const { forOthers: _was, ...rest } = action;
  return on ? { ...rest, forOthers: true } : rest;
}

/** The button with its steps replaced; one left with none has no `choices`. */
function withChoices(button: RecoveryButton, choices: RecoveryChoice[]): RecoveryButton {
  const { choices: _was, ...rest } = button;
  return choices.length > 0 ? { ...rest, choices } : rest;
}

/** The button with `change` applied to its step `choiceId`, whose counts are then kept within reach. */
export function withChoiceChanged(button: RecoveryButton, choiceId: string, change: (choice: RecoveryChoice) => RecoveryChoice): RecoveryButton {
  return withChoices(button, (button.choices ?? []).map((choice) => (choice.id === choiceId ? clampedPicks(change(choice)) : choice)));
}

/** The button with `change` applied to the action `actionId` of its step `choiceId`. */
export function withActionChanged(button: RecoveryButton, choiceId: string, actionId: string, change: (action: RecoveryAction) => RecoveryAction): RecoveryButton {
  return withChoiceChanged(button, choiceId, (choice) => ({
    ...choice,
    actions: choice.actions.map((action) => (action.id === actionId ? change(action) : action)),
  }));
}

/**
 * The button with a new step at the end, asking `prompt` for exactly one of a single action named
 * `actionName`; null where the button has as many steps as it may.
 */
export function withAddedChoice(button: RecoveryButton, prompt: string, actionName: string, random: () => number = Math.random): Added | null {
  const choices = button.choices ?? [];
  if (choices.length >= MAX_RECOVERY_CHOICES) return null;
  const action: RecoveryAction = { id: newRecoveryId('act', [], random), name: actionName.trim(), rules: [] };
  const choice: RecoveryChoice = { id: newRecoveryId('step', choices, random), prompt: prompt.trim(), min: 1, max: 1, actions: [action] };
  return { button: withChoices(button, [...choices, choice]), scope: { kind: 'action', choice: choice.id, action: action.id } };
}

export function withoutChoice(button: RecoveryButton, choiceId: string): RecoveryButton {
  return withChoices(button, (button.choices ?? []).filter((choice) => choice.id !== choiceId));
}

/** The button with a new action named `name` at the end of its step; null where the step has as many as it may, or is gone. */
export function withAddedAction(button: RecoveryButton, choiceId: string, name: string, random: () => number = Math.random): Added | null {
  const choice = button.choices?.find((each) => each.id === choiceId);
  if (!choice || choice.actions.length >= MAX_RECOVERY_ACTIONS) return null;
  const action: RecoveryAction = { id: newRecoveryId('act', choice.actions, random), name: name.trim(), rules: [] };
  return {
    button: withChoiceChanged(button, choiceId, (each) => ({ ...each, actions: [...each.actions, action] })),
    scope: { kind: 'action', choice: choiceId, action: action.id },
  };
}

/** Whether the action can go: a step keeps at least one. */
export function canRemoveAction(choice: RecoveryChoice): boolean {
  return choice.actions.length > 1;
}

/** The button without the action, its step's counts brought within its actions left; null where it is the step's last. */
export function withoutAction(button: RecoveryButton, choiceId: string, actionId: string): RecoveryButton | null {
  const choice = button.choices?.find((each) => each.id === choiceId);
  if (!choice || !canRemoveAction(choice)) return null;
  return withChoiceChanged(button, choiceId, (each) => ({ ...each, actions: each.actions.filter((action) => action.id !== actionId) }));
}
