/**
 * What applying a recovery button works with: the character as the rest reads it, the plan of what
 * each rule will change, the player's choices, and the changes a rest made. Pure data; the engine
 * is `restPlan.ts` and `restOutcome.ts`.
 */

import type { ResourceDefinition, ResourceValue } from '../resources/resourceTypes';
import type { FieldKey, FieldValue, TemplateField } from '../statblocks/model/templateTypes';
import type { CounterRowFilter } from '../statblocks/values/counterRestore';
import type { ConditionDefinition } from '../types/collectionSettingsTypes';
import type { FilledFormula, FormulaProblem } from './recoveryFormula';
import type { RecoveryButton, RecoveryRule } from './recoveryTypes';

/**
 * A player character as a rest reads it: its collection's resources and conditions, its
 * statblock's template fields, and where each of its values is held now.
 */
export interface RestCharacter {
  /** Who it is (the library token that is the character), and its name, as changes made to it are told. */
  readonly id: string;
  readonly name: string;
  readonly resources: readonly ResourceDefinition[];
  /**
   * The resource a template field is, which a rule names it by: the number the template tracks, else the
   * collection's resource that reads the field (`resourceOfField`; a static one too, which no rest changes).
   */
  resourceOf(field: FieldKey): ResourceDefinition | undefined;
  readonly conditions: readonly ConditionDefinition[];
  /** The template's fields by key. */
  readonly fields: ReadonlyMap<FieldKey, TemplateField>;
  /** A resource's value: on the character's token in an open scene, else the played campaign's; undefined where neither holds one. */
  resourceValue(key: string): ResourceValue | undefined;
  /** A condition's number on the character's token (0 without the condition); null while no open scene holds a token of it. */
  conditionValue(id: string): number | null;
  /** What the note holds of a field (its counters). */
  fieldValue(key: FieldKey): FieldValue | undefined;
  /** What the note holds at a dotted path (`@level`, `@abilities.con`). */
  lookup(path: string): unknown;
}

/** A resource, a Counters field's rows, or a condition, found on the character. */
export type RestMetric =
  | { readonly kind: 'resource'; readonly key: string; readonly label: string; readonly definition: ResourceDefinition; readonly value: ResourceValue }
  | {
    readonly kind: 'counters';
    readonly key: FieldKey;
    readonly label: string;
    readonly field: TemplateField;
    readonly rows: CounterRowFilter;
    readonly value: FieldValue | undefined;
  }
  | { readonly kind: 'condition'; readonly id: string; readonly label: string; readonly definition: ConditionDefinition; readonly value: number };

/** What a Spend rule lets the player choose: how many units, 0 to `max`. */
export interface SpendChoice {
  /** The source's name ("Hit Dice"). */
  readonly label: string;
  readonly max: number;
  /** What one unit gives, with the note's numbers in (`1d8+(2)`). */
  readonly each: string;
}

/**
 * Where a rule stands in a rest, which spends and skips name: `always:2` (the button's third rule),
 * `pick:0:1` (the second rule of the first action picked).
 */
export type RuleRef = string;

export const alwaysRef = (rule: number): RuleRef => `always:${rule}`;
export const pickRef = (pick: number, rule: number): RuleRef => `pick:${pick}:${rule}`;

/** An action the player picked in one of the button's steps, for themselves (`for` null) or another player character, by its id. */
export interface RestPick {
  readonly choice: string;
  readonly action: string;
  readonly for: string | null;
}

/** A rule whose metrics were found. */
export interface PlannedRule {
  /** The rule's place in the rest, in the order rules apply: the button's own, then each pick's. */
  readonly index: number;
  readonly ref: RuleRef;
  readonly rule: RecoveryRule;
  /** The character whose metric it changes: the one resting, or the one an action is taken for. */
  readonly character: RestCharacter;
  readonly target: RestMetric;
  /** A Spend rule's source. */
  readonly source?: RestMetric;
  /** The formula of an Amount rule, or one unit of a Spend rule, with the note's numbers in. */
  readonly formula?: FilledFormula;
  /** The number a Set rule sets. */
  readonly to?: number;
  readonly spend?: SpendChoice;
}

/** Why a rule does nothing in this rest. */
export type RestSkip =
  | { readonly kind: 'unknown-resource' | 'static-resource' | 'no-value'; readonly key: string }
  | { readonly kind: 'unknown-field' | 'unreadable-counters'; readonly key: FieldKey }
  | { readonly kind: 'unknown-condition' | 'no-token'; readonly id: string }
  /** An action taken for a character the rest cannot reach (gone from the table, no statblock of its own). */
  | { readonly kind: 'unknown-ally'; readonly id: string }
  | { readonly kind: 'formula'; readonly problem: FormulaProblem }
  | { readonly kind: 'roll'; readonly formula: string };

export interface SkippedRule {
  readonly index: number;
  readonly ref: RuleRef;
  readonly rule: RecoveryRule;
  /** The metric it names, as the character calls it where it was found, else as the rule names it. */
  readonly label: string;
  readonly reason: RestSkip;
}

/** What pressing a button would do for a character. */
export interface RestPlan {
  readonly button: RecoveryButton;
  readonly rules: readonly PlannedRule[];
  readonly skipped: readonly SkippedRule[];
}

/** What the player chose: the actions they picked, and how many units each Spend rule spends, by its reference (a rule not named spends none). */
export interface RestChoices {
  readonly picks: readonly RestPick[];
  readonly spends: ReadonlyMap<RuleRef, number>;
}

/** A roll a rest made, as shown in its summary: "2d8+2" for 11. */
export interface RestRoll {
  readonly formula: string;
  readonly total: number;
}

/**
 * Rolls a formula with dice (never one without: the engine works those out itself), named by
 * `label` ("Hit Dice (Short rest)"); null where it cannot be rolled.
 */
export type RestRoller = (formula: string, label: string) => RestRoll | null;

/** What a change is made to: a resource, one row of a Counters field (by its stored place), a condition. */
export type RestChangeTarget =
  | { readonly kind: 'resource'; readonly key: string }
  | { readonly kind: 'counters'; readonly key: FieldKey; readonly row: number }
  | { readonly kind: 'condition'; readonly id: string };

/**
 * One metric changed by the rest, as its summary shows it: "HP 4 → 18 (2d8+2)". A resource counts
 * as it counts (used for one that fills), a row of counters by its uses left, a condition by its
 * number (0: gone).
 */
export interface RestChange {
  /** The character it was made to: the one resting, or one an action was taken for. */
  readonly character: { readonly id: string; readonly name: string };
  readonly target: RestChangeTarget;
  readonly label: string;
  readonly from: number;
  readonly to: number;
  /** The rolls that went into it, in order; empty where nothing was rolled. */
  readonly rolls: readonly RestRoll[];
}

/** What a rest did: its changes in the order of their metrics' first rule, the skipped rules, and each character's values to write, by its id. */
export interface RestOutcome {
  readonly changes: readonly RestChange[];
  readonly skipped: readonly SkippedRule[];
  readonly byCharacter: ReadonlyMap<string, CharacterChanges>;
}

/** The values a rest changed of one character, as they are to be written. */
export interface CharacterChanges {
  /** Each changed resource's value as it is to be written. */
  readonly resources: ReadonlyMap<string, ResourceValue>;
  /** Each changed Counters field's value as it is to be written, with the value it was planned from. */
  readonly counters: ReadonlyMap<FieldKey, { readonly field: TemplateField; readonly base: FieldValue | undefined; readonly next: FieldValue }>;
  /** Each changed condition's number (0: removed). */
  readonly conditions: ReadonlyMap<string, number>;
}
