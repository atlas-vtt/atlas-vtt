/**
 * Reads recovery buttons where they arrive unchecked: a template's file, a bundle. Strict: a button or rule it cannot read whole is left out, never guessed at, and what
 * it keeps is capped at `MAX_RECOVERY_BUTTONS` buttons per template and `MAX_RECOVERY_RULES`
 * rules per button. Pure.
 */

import { isRecord, own } from '../statblocks/format/jsonValues';
import { FORMULA_LIMITS } from '../tools/formulaTypes';
import {
  MAX_ACTION_PICKS,
  MAX_RECOVERY_ACTIONS,
  MAX_RECOVERY_BUTTONS,
  MAX_RECOVERY_CHOICES,
  MAX_RECOVERY_RULES,
  type ConditionTarget,
  type RecoveryAction,
  type RecoveryButton,
  type RecoveryChoice,
  type RecoveryRule,
  type ResourceOrCounters,
} from './recoveryTypes';

/** The longest id or name a button, metric or field may have. */
export const MAX_RECOVERY_TEXT = 100;
/** The longest text an action has. */
export const MAX_ACTION_TEXT = 400;
/** The largest number a rule names (a minimum, a value to set, a cap, a step). */
const MAX_RECOVERY_NUMBER = 1_000_000;

/** A text that is not blank, at most `MAX_RECOVERY_TEXT` long, as written; undefined otherwise. */
function name(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' && value.length <= MAX_RECOVERY_TEXT ? value : undefined;
}

/** A formula as written, trimmed: not blank and no longer than a formula may be. */
function formula(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const text = value.trim();
  return text !== '' && text.length <= FORMULA_LIMITS.characters ? text : undefined;
}

function whole(value: unknown, least: number): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= least && value <= MAX_RECOVERY_NUMBER ? value : undefined;
}

/**
 * An optional whole number of at least `least`: no value where it is absent, the value where it
 * reads, and null where it is present and does not (which leaves the rule out: a minimum or cap dropped
 * would change what the rule gives).
 */
function optionalWhole(raw: Record<string, unknown>, key: string, least: number): { value?: number } | null {
  const value = own(raw, key);
  if (value === undefined) return {};
  const read = whole(value, least);
  return read === undefined ? null : { value: read };
}

/** The ids of the buttons whose rows a counters target restores, each once; undefined where any is no id. */
function rowIds(value: unknown): readonly string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const ids = value.map(name);
  if (!ids.every((id): id is string => id !== undefined)) return undefined;
  const unique = [...new Set(ids)];
  return unique.length <= MAX_RECOVERY_BUTTONS ? unique : undefined;
}

/** A resource or counters target, or undefined where it is neither. */
function metricTarget(value: unknown): ResourceOrCounters | undefined {
  if (!isRecord(value)) return undefined;
  const kind = own(value, 'kind');
  if (kind === 'resource') {
    const field = name(own(value, 'field'));
    return field === undefined ? undefined : { kind, field };
  }
  if (kind !== 'counters') return undefined;
  const field = name(own(value, 'field'));
  const raw = own(value, 'rows');
  const rows = raw === 'all' ? 'all' : rowIds(raw);
  return field === undefined || rows === undefined ? undefined : { kind, field, rows };
}

function conditionTarget(value: unknown): ConditionTarget | undefined {
  if (!isRecord(value) || own(value, 'kind') !== 'condition') return undefined;
  const id = name(own(value, 'id'));
  return id === undefined ? undefined : { kind: 'condition', id };
}

/** A rule on a metric with a maximum, or undefined where it cannot be read whole. */
function metricRule(raw: Record<string, unknown>, target: ResourceOrCounters): RecoveryRule | undefined {
  switch (own(raw, 'does')) {
    case 'full':
      return { target, does: 'full' };
    case 'amount': {
      const text = formula(own(raw, 'formula'));
      const min = optionalWhole(raw, 'min', 0);
      if (text === undefined || min === null) return undefined;
      return { target, does: 'amount', formula: text, ...(min.value !== undefined && { min: min.value }) };
    }
    case 'share': {
      const share = own(raw, 'share');
      const round = own(raw, 'round');
      const min = optionalWhole(raw, 'min', 0);
      if ((share !== 0.25 && share !== 0.5) || (round !== 'down' && round !== 'up') || min === null) return undefined;
      return { target, does: 'share', share, round, ...(min.value !== undefined && { min: min.value }) };
    }
    case 'set': {
      const to = own(raw, 'to');
      if (isRecord(to)) {
        const field = name(own(to, 'field'));
        return field === undefined ? undefined : { target, does: 'set', to: { field } };
      }
      const value = whole(to, 0);
      return value === undefined ? undefined : { target, does: 'set', to: value };
    }
    case 'spend': {
      const from = metricTarget(own(raw, 'from'));
      const each = formula(own(raw, 'each'));
      const most = optionalWhole(raw, 'most', 1);
      if (from === undefined || each === undefined || most === null) return undefined;
      return { target, does: 'spend', from, each, ...(most.value !== undefined && { most: most.value }) };
    }
    default:
      return undefined;
  }
}

/** A rule on a condition, or undefined where it cannot be read whole. */
function conditionRule(raw: Record<string, unknown>, target: ConditionTarget): RecoveryRule | undefined {
  switch (own(raw, 'does')) {
    case 'step': {
      const by = own(raw, 'by');
      if (typeof by !== 'number' || whole(Math.abs(by), 1) === undefined) return undefined;
      return { target, does: 'step', by };
    }
    case 'clear':
      return { target, does: 'clear' };
    default:
      return undefined;
  }
}

/**
 * One rule, or undefined: a target of a kind the rule does not take (a condition has no maximum
 * to fill, a resource no step), or any part it cannot read, leaves it out.
 */
export function parseRecoveryRule(raw: unknown): RecoveryRule | undefined {
  if (!isRecord(raw)) return undefined;
  const target = own(raw, 'target');
  const metric = metricTarget(target);
  if (metric) return metricRule(raw, metric);
  const condition = conditionTarget(target);
  return condition ? conditionRule(raw, condition) : undefined;
}

/** The rules of a list that can be read, the first `MAX_RECOVERY_RULES`; undefined where it is no list. */
function ruleList(raw: unknown): RecoveryRule[] | undefined {
  return Array.isArray(raw) ? raw.flatMap((rule) => parseRecoveryRule(rule) ?? []).slice(0, MAX_RECOVERY_RULES) : undefined;
}

/** Entries that can be read, the first of each id, at most `most`. */
function uniqueById<T extends { id: string }>(raw: unknown, read: (entry: unknown) => T | undefined, most: number): T[] {
  if (!Array.isArray(raw)) return [];
  const ids = new Set<string>();
  const kept: T[] = [];
  for (const entry of raw) {
    const item = read(entry);
    if (!item || ids.has(item.id)) continue;
    ids.add(item.id);
    kept.push(item);
    if (kept.length === most) break;
  }
  return kept;
}

/** One action: an id, a name and its rules (none is fine), a text and whether it may be taken for another. */
export function parseRecoveryAction(raw: unknown): RecoveryAction | undefined {
  if (!isRecord(raw)) return undefined;
  const id = name(own(raw, 'id'));
  const label = name(own(raw, 'name'));
  const rules = ruleList(own(raw, 'rules'));
  if (id === undefined || label === undefined || rules === undefined) return undefined;
  const written = own(raw, 'text');
  const text = typeof written === 'string' ? written.trim().slice(0, MAX_ACTION_TEXT) : '';
  return { id, name: label.trim(), rules, ...(text !== '' && { text }), ...(own(raw, 'forOthers') === true && { forOthers: true }) };
}

/**
 * One step: an id, a prompt, how many picks it takes (`min` 0 to `max`, `max` 1 to
 * `MAX_ACTION_PICKS`) and at least one action that can be read. A step whose counts do not read is
 * left out: guessing them would let a player take more, or fewer, than the rules allow.
 */
export function parseRecoveryChoice(raw: unknown): RecoveryChoice | undefined {
  if (!isRecord(raw)) return undefined;
  const id = name(own(raw, 'id'));
  const prompt = name(own(raw, 'prompt'));
  const max = whole(own(raw, 'max'), 1);
  const min = whole(own(raw, 'min'), 0);
  if (id === undefined || prompt === undefined || max === undefined || min === undefined || max > MAX_ACTION_PICKS || min > max) return undefined;
  const actions = uniqueById(own(raw, 'actions'), parseRecoveryAction, MAX_RECOVERY_ACTIONS);
  if (actions.length === 0) return undefined;
  const repeat = own(raw, 'repeat') === true;
  // Without repeats a step cannot ask for more picks than it has actions
  if (!repeat && min > actions.length) return undefined;
  return { id, prompt: prompt.trim(), min, max: repeat ? max : Math.min(max, actions.length), ...(repeat && { repeat: true }), actions };
}

/** One button: an id and a name, the rules it can read, the first `MAX_RECOVERY_RULES`, and its steps. */
export function parseRecoveryButton(raw: unknown): RecoveryButton | undefined {
  if (!isRecord(raw)) return undefined;
  const id = name(own(raw, 'id'));
  const label = name(own(raw, 'name'));
  const rules = ruleList(own(raw, 'rules'));
  if (id === undefined || label === undefined || rules === undefined) return undefined;
  const choices = uniqueById(own(raw, 'choices'), parseRecoveryChoice, MAX_RECOVERY_CHOICES);
  return { id, name: label.trim(), rules, ...(choices.length > 0 && { choices }) };
}

/** A template's buttons that can be read, the first of each id, the first `MAX_RECOVERY_BUTTONS`. */
export function parseRecoveryButtons(raw: unknown): RecoveryButton[] {
  return uniqueById(raw, parseRecoveryButton, MAX_RECOVERY_BUTTONS);
}
