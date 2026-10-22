/**
 * Recovery buttons: what a statblock template offers a player character to get its metrics back
 * with ("Short rest", "Long rest"), stored in the template (`StatblockTemplate.recovery`). A button
 * is a list of rules, each saying what happens to one metric: a number of the statblock (the
 * collection's resource that reads it, or the number the template tracks), a row of counters or a
 * valued condition of the collection. Rules belong
 * to the button, never to the metric, so one metric may be restored differently by each button.
 * Pure data.
 */

import type { FieldKey } from '../statblocks/model/templateTypes';

/** The most buttons one template offers, and the most rules one button (or one action) holds. */
export const MAX_RECOVERY_BUTTONS = 6;
export const MAX_RECOVERY_RULES = 16;
/** The most steps one button asks the player through, the most actions a step offers, and the most picks a step takes. */
export const MAX_RECOVERY_CHOICES = 4;
export const MAX_RECOVERY_ACTIONS = 8;
export const MAX_ACTION_PICKS = 6;

/**
 * A number of the statblock, by its template field: the resource of the character that reads it
 * (the collection's resource reading that field, else the number the template tracks), found when
 * a rest runs (`resourceOfField`), so the same template restores HP in every collection.
 */
export interface ResourceTarget {
  kind: 'resource';
  field: FieldKey;
}

/**
 * The rows of a Counters field: every row, or those whose `reset` (in the note) names one of these
 * buttons, by id. A Long rest may so restore the rows set to Short rest as well.
 */
export interface CountersTarget {
  kind: 'counters';
  field: FieldKey;
  rows: 'all' | readonly string[];
}

/** A valued condition of the collection, by its id (Exhaustion). */
export interface ConditionTarget {
  kind: 'condition';
  id: string;
}

/** What a rule changes. */
export type RecoveryTarget = ResourceTarget | CountersTarget | ConditionTarget;

/** The metrics that have a maximum to restore towards. */
export type ResourceOrCounters = ResourceTarget | CountersTarget;

/** Back to its full value. */
export interface FullRule {
  target: ResourceOrCounters;
  does: 'full';
}

/** Back by a formula ("1d4+@tier", "@level"), at least `min` where set. */
export interface AmountRule {
  target: ResourceOrCounters;
  does: 'amount';
  formula: string;
  min?: number;
}

/** Back by a share of the maximum, rounded `round`, at least `min` where set. */
export interface ShareRule {
  target: ResourceOrCounters;
  does: 'share';
  share: 0.25 | 0.5;
  round: 'down' | 'up';
  min?: number;
}

/** Set to a number, or to the number a statblock field holds (Stress to 0). */
export interface SetRule {
  target: ResourceOrCounters;
  does: 'set';
  to: number | { field: FieldKey };
}

/**
 * Back by spending another metric (Hit Dice): the player picks how many units, up to what `from`
 * holds and `most` where set; each adds `each` to one formula.
 */
export interface SpendRule {
  target: ResourceOrCounters;
  does: 'spend';
  from: ResourceOrCounters;
  each: string;
  most?: number;
}

/** A condition's value moved by `by` (Exhaustion −1); at 0 it goes. */
export interface StepRule {
  target: ConditionTarget;
  does: 'step';
  by: number;
}

/** A condition gone. */
export interface ClearRule {
  target: ConditionTarget;
  does: 'clear';
}

export type RecoveryRule = FullRule | AmountRule | ShareRule | SetRule | SpendRule | StepRule | ClearRule;

export type RecoveryRuleKind = RecoveryRule['does'];

/**
 * Something a player may do on a rest, picked in one of its button's steps ("Tend to Wounds"):
 * its own rules, none where it changes nothing Atlas keeps ("Work on a Project").
 */
export interface RecoveryAction {
  /** Never changes: requests and logs name it. */
  id: string;
  name: string;
  /** What it does, in a sentence for the player. */
  text?: string;
  /** Applied in order, to the character it is taken for. */
  rules: RecoveryRule[];
  /** It may be taken for another player character instead (an ally's wounds); unset: for oneself only. */
  forOthers?: true;
}

/**
 * A step of a rest: the player picks from its actions, at least `min` and at most `max` of them
 * ("Choose two downtime moves": 2 and 2; "up to two": 0 and 2), each once unless `repeat`.
 */
export interface RecoveryChoice {
  /** Never changes: requests name it. */
  id: string;
  /** What the player is asked. */
  prompt: string;
  min: number;
  max: number;
  /** An action may be picked more than once. */
  repeat?: true;
  actions: RecoveryAction[];
}

export interface RecoveryButton {
  /** Never changes: requests, counter rows and logs name it. */
  id: string;
  /** "Long rest". */
  name: string;
  /** Applied in order, every time, before what the player picks. */
  rules: RecoveryRule[];
  /** Steps the player picks actions in, in order; unset or empty: the rest asks for nothing but its spends. */
  choices?: RecoveryChoice[];
}

