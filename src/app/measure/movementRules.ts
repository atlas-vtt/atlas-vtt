/**
 * How a game system reads a token's movement: the steps a move falls into, each a multiple of the
 * token's speed (one move, a second one, a third), and whether movement adds up over a turn. The
 * rules are the collection's and name no game; whoever colours a move is handed them.
 */

import { isHexColor } from '../utils/hexColor';

/** One step of movement: every distance up to `multiple` times the token's speed, past the step before. */
export interface MovementStep {
  name: string;
  /** How many times the token's speed the step reaches; above 0, and above the step before. */
  multiple: number;
  /** '#rrggbb', one of the colours the settings offer. */
  color: string;
}

export interface MovementRules {
  /** The steps in rising order, at most `MAX_MOVEMENT_STEPS`; none switches the rules off. */
  steps: MovementStep[];
  /** Whether what a token moves adds up over a turn while a fight runs. */
  countPerTurn: boolean;
}

export const MAX_MOVEMENT_STEPS = 4;
/** The longest name a step keeps; a longer one is cut there. */
export const MAX_STEP_NAME = 24;
/** The largest multiple a step may have. */
export const MAX_STEP_MULTIPLE = 100;

/** Movement of a system without steps: a move looks as it always did. */
export const NO_MOVEMENT_RULES: Readonly<MovementRules> = Object.freeze({ steps: [], countPerTurn: false });

/** Whether `multiple` can be a step's: a number above 0 and no more than `MAX_STEP_MULTIPLE`. */
export function isStepMultiple(multiple: unknown): multiple is number {
  return typeof multiple === 'number' && multiple > 0 && multiple <= MAX_STEP_MULTIPLE;
}

function parseStep(raw: unknown): MovementStep | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const { name, multiple, color } = raw as Record<string, unknown>;
  if (typeof name !== 'string' || !isStepMultiple(multiple) || !isHexColor(color)) return null;
  const trimmed = name.trim().slice(0, MAX_STEP_NAME).trim();
  return trimmed === '' ? null : { name: trimmed, multiple, color };
}

/**
 * Stored movement rules, or undefined where `raw` holds none. A step that cannot be used (no name,
 * no multiple above the step before, no colour) is dropped, as are steps past the fourth. Rules
 * without steps are rules too: a collection that removed its system's steps moves without any.
 */
export function parseMovementRules(raw: unknown): MovementRules | undefined {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return undefined;
  const { steps, countPerTurn } = raw as Record<string, unknown>;
  const kept: MovementStep[] = [];
  for (const entry of Array.isArray(steps) ? steps : []) {
    const step = parseStep(entry);
    if (step && kept.length < MAX_MOVEMENT_STEPS && step.multiple > (kept[kept.length - 1]?.multiple ?? 0)) kept.push(step);
  }
  return { steps: kept, countPerTurn: countPerTurn === true };
}

/** Whether the rules do anything: they name a step, or count movement per turn. */
export function hasMovementRules(rules: MovementRules | undefined): rules is MovementRules {
  return rules !== undefined && (rules.steps.length > 0 || rules.countPerTurn);
}

/**
 * Whether rules being edited can be saved: every step has a name and a multiple above the step
 * before. While they are typed a name may be empty and a multiple no number.
 */
export function isValidMovementRules(rules: MovementRules): boolean {
  return rules.steps.length <= MAX_MOVEMENT_STEPS
    && rules.steps.every((step, i) => step.name.trim() !== ''
      && isStepMultiple(step.multiple)
      && step.multiple > (rules.steps[i - 1]?.multiple ?? 0)
      && isHexColor(step.color));
}

/** The rules as they are stored: every name trimmed. */
export function savedMovementRules(rules: MovementRules): MovementRules {
  return {
    steps: rules.steps.map((step) => ({ name: step.name.trim().slice(0, MAX_STEP_NAME).trim(), multiple: step.multiple, color: step.color })),
    countPerTurn: rules.countPerTurn,
  };
}

function sameSteps(a: readonly MovementStep[], b: readonly MovementStep[], sameName: (a: string, b: string) => boolean): boolean {
  return a.length === b.length
    && a.every((step, i) => sameName(step.name, b[i]!.name) && Object.is(step.multiple, b[i]!.multiple) && step.color.toLowerCase() === b[i]!.color.toLowerCase());
}

/** Whether two systems move alike; no rules are rules without steps that count nothing. */
export function sameMovementRules(a: MovementRules | undefined, b: MovementRules | undefined): boolean {
  const left = a ?? NO_MOVEMENT_RULES;
  const right = b ?? NO_MOVEMENT_RULES;
  return left.countPerTurn === right.countPerTurn && sameSteps(left.steps, right.steps, (x, y) => x.trim() === y.trim());
}

/** Whether what was typed is the system's rules to the letter: a name with a space after it is kept as typed. */
export function sameTypedMovementRules(typed: MovementRules, system: MovementRules): boolean {
  return typed.countPerTurn === system.countPerTurn && sameSteps(typed.steps, system.steps, (x, y) => x === y);
}

/** How far a distance may pass a step's end and still lie in it, as a share of the speed: 30 ft worked out as 30.000000001 is 30. */
const STEP_TOLERANCE = 1e-9;

/**
 * The step a move of `distance` lies in for a token of `speed` (both in the same unit): the first
 * step that reaches as far, `'beyond'` past the last one. Null where no step can be told: rules
 * without steps, a token without a speed, or a distance that is no number.
 */
export function movementStepFor(distance: number, speed: number | null | undefined, rules: MovementRules | undefined): MovementStep | 'beyond' | null {
  if (!rules || rules.steps.length === 0 || typeof speed !== 'number' || !(speed > 0) || !Number.isFinite(speed) || !Number.isFinite(distance)) return null;
  const moved = Math.max(0, distance) / speed;
  return rules.steps.find((step) => moved <= step.multiple + STEP_TOLERANCE) ?? 'beyond';
}
