/**
 * A Counters field's value: rows of limited uses (a level's spell slots, ki, a
 * feature's uses per day), each `{ name, max, used, reset, regain }` in the
 * note, where `reset` holds the id of the recovery button that gives the row's
 * uses back (the character's own choice, not the template's) and `regain` the dice
 * formula of how many uses it gives back (unset: all). Read strictly: a row
 * that is no counter or regains no formula Atlas rolls makes the whole value a
 * misfit, shown as it is written, and nothing is clamped. Changes keep every
 * other key of a row.
 *
 * A row's maximum is the note's own, or the template's: a row stored with the
 * maximum its template row had also says so (`templateMax`), and while its
 * `max` still is that number it takes the template's maximum as it is now, so
 * a maximum changed in the template reaches the statblocks that never set
 * their own. A row without it (hand-written, stored by an earlier build) or
 * with another `max` (set for this character) keeps its own. Reading changes
 * no note: the next change of the field stores what is shown.
 * Pure: no React, no Obsidian.
 */

import type { FieldValue, TemplateField } from '../model/templateTypes';
import { isRegainFormula } from './counterRegain';
import { isPlainRecord } from './fieldValueOf';

/** One row as the card draws it, and its place in the stored list. */
export interface CounterRow {
  name: string;
  max: number;
  used: number;
  /** The id of the recovery button that gives the row's uses back, as the note writes it; null for none. */
  reset: string | null;
  /** The dice formula of how many uses come back then, as the note writes it; null for all of them. */
  regain: string | null;
}

const isWhole = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0;

/** An optional text of a row: null where it is absent, undefined where it is no text. */
function optionalText(value: unknown): string | null | undefined {
  if (value === undefined || value === null) return null;
  return typeof value === 'string' ? value : undefined;
}

/**
 * One stored row, or null where it is none: a name, a whole maximum, as many used as that at most
 * (missing: none), a recovery button id and a regained formula that are text where it has them. They
 * are taken as written: `readCounterRows` checks the formula.
 */
export function readCounterRow(value: unknown): CounterRow | null {
  if (!isPlainRecord(value) || typeof value.name !== 'string' || !isWhole(value.max)) return null;
  const used = value.used ?? 0;
  const reset = optionalText(value.reset);
  const regain = optionalText(value.regain);
  if (!isWhole(used) || used > value.max || reset === undefined || regain === undefined) return null;
  return { name: value.name, max: value.max, used, reset, regain };
}

/** Whether a row regains nothing but a formula Atlas rolls. */
function regainsFormula(row: CounterRow): boolean {
  return row.regain === null || isRegainFormula(row.regain);
}

/** Every row of a stored value, or null where the value is no list of counters: a row that is none, or regains what Atlas does not roll. */
export function readCounterRows(value: FieldValue | undefined): CounterRow[] | null {
  if (!Array.isArray(value)) return null;
  const rows = value.map(readCounterRow);
  return rows.every((row): row is CounterRow => row !== null && regainsFormula(row)) ? rows : null;
}

/**
 * The rows a statblock of the field starts with, none used and no recovery button chosen. A regained
 * count that is no formula reads as none (the template reports it), so a note never stores it.
 */
export function presetCounterRows(field: Pick<TemplateField, 'counterRows'>): CounterRow[] {
  return (field.counterRows ?? []).map((row) => ({
    name: row.name,
    max: row.max,
    used: 0,
    reset: null,
    regain: row.regain !== undefined && isRegainFormula(row.regain) ? row.regain : null,
  }));
}

/** The preset rows as the value a statblock that holds none is read with; undefined where the template gives none. */
export function startCountersValue(field: Pick<TemplateField, 'counterRows'>): FieldValue | undefined {
  const rows = presetCounterRows(field);
  return rows.length > 0 ? rows.map((row) => storedRow(row, undefined)) : undefined;
}

function isUnset(value: FieldValue | undefined): boolean {
  return value === undefined || value === null || (Array.isArray(value) && value.length === 0);
}

const sameRowName = (a: CounterRow, b: CounterRow): boolean => a.name.trim().toLowerCase() === b.name.trim().toLowerCase();

/** A row the card shows, and the template's row it is the note's row of (none: a row only the note has). */
interface HeldRow {
  row: CounterRow;
  preset: CounterRow | undefined;
}

/** The key of a stored row that holds the template's maximum its `max` was taken from. */
const TEMPLATE_MAX_KEY = 'templateMax';

/** Whether a stored row's maximum is still the one it took from its template, so it has none of its own. */
function takesTemplateMax(stored: FieldValue | undefined, row: CounterRow): boolean {
  return isPlainRecord(stored) && stored[TEMPLATE_MAX_KEY] === row.max;
}

/** The row with its template row's maximum as it is now, its uses within it. */
function atTemplateMax(row: CounterRow, preset: CounterRow): CounterRow {
  return row.max === preset.max ? row : { ...row, max: preset.max, used: Math.min(row.used, preset.max) };
}

/**
 * The rows the card shows, each with the template row it holds: the note's, then the template's preset rows it
 * does not hold (a note keeps the list of its first press, so rows the template gained since would never show),
 * none used until a change stores them; a preset row without uses adds nothing. The note holds a preset row by
 * name, or by place where the template renamed it: its row at the preset's place answers to no preset by name.
 * A row that took its maximum from the preset it holds has the preset's as it is now. Null where the note's value
 * is no list of counters.
 */
function heldRows(field: Pick<TemplateField, 'counterRows'>, value: FieldValue | undefined): HeldRow[] | null {
  const presets = presetCounterRows(field);
  const fromTemplate = (preset: CounterRow): HeldRow => ({ row: preset, preset });
  if (isUnset(value)) return presets.map(fromTemplate);
  const own = readCounterRows(value);
  if (!own || !Array.isArray(value)) return null;
  const heldByName = (preset: CounterRow): boolean => own.some((row) => sameRowName(row, preset));
  const held = own.map((row, index): HeldRow => {
    const atPlace = presets[index];
    const preset = presets.find((each) => sameRowName(row, each)) ?? (atPlace && !heldByName(atPlace) ? atPlace : undefined);
    return { row: preset && takesTemplateMax(value[index], row) ? atTemplateMax(row, preset) : row, preset };
  });
  const gained = presets.filter((preset, index) => isDrawnCounter(preset) && !heldByName(preset) && held[index]?.preset !== preset);
  return [...held, ...gained.map(fromTemplate)];
}

/** The rows the card shows (`heldRows`); null where the note's value is no list of counters. */
export function shownCounterRows(field: Pick<TemplateField, 'counterRows'>, value: FieldValue | undefined): CounterRow[] | null {
  return heldRows(field, value)?.map((held) => held.row) ?? null;
}

/** Whether a row is drawn: one with no uses (a spell level not reached yet) is not. */
export function isDrawnCounter(row: CounterRow): boolean {
  return row.max > 0;
}

/** The keys a stored row's counter is read from; any other key of a row is the note's own. */
export const COUNTER_ROW_KEYS: ReadonlySet<string> = new Set(['name', 'max', 'used', 'reset', 'regain', TEMPLATE_MAX_KEY]);

/**
 * A row as it is stored: name, maximum, used, its recovery button and what it regains, in that order, the
 * template's maximum where the row's is that of the template row it holds (`preset`), then whatever else the
 * note's row held.
 */
function storedRow(row: CounterRow, preset: CounterRow | undefined, kept: Record<string, FieldValue> = {}): FieldValue {
  const rest = Object.entries(kept).filter(([key]) => !COUNTER_ROW_KEYS.has(key));
  return {
    name: row.name, max: row.max, used: row.used,
    ...(row.reset !== null && { reset: row.reset }), ...(row.regain !== null && { regain: row.regain }),
    ...(preset?.max === row.max && { [TEMPLATE_MAX_KEY]: row.max }),
    ...Object.fromEntries(rest),
  };
}

/** The stored list with each row passed through `change`: every row the card shows, the note's own first, so an index names the same row in both. */
function changedRows(field: Pick<TemplateField, 'counterRows'>, value: FieldValue | undefined, change: (row: CounterRow, index: number) => CounterRow): FieldValue | null {
  const rows = heldRows(field, value);
  if (!rows) return null;
  const stored = Array.isArray(value) ? value : [];
  return rows.map(({ row, preset }, index) => {
    const own = stored[index];
    return storedRow(change(row, index), preset, isPlainRecord(own) ? own : {});
  });
}

/** The value with row `index` at `used` uses (kept within 0 and its maximum); null where the value is no list of counters or holds no such row. */
export function withCounterUsed(field: Pick<TemplateField, 'counterRows'>, value: FieldValue | undefined, index: number, used: number): FieldValue | null {
  const rows = shownCounterRows(field, value);
  const row = rows?.[index];
  if (!row) return null;
  const next = Math.max(0, Math.min(row.max, Math.round(used)));
  if (next === row.used) return null;
  return changedRows(field, value, (each, at) => (at === index ? { ...each, used: next } : each));
}

/**
 * The value with each row at the uses `uses` names for it, in the stored order; null where the value is no list
 * of counters or `uses` names another number of rows. Uses are taken as given: the caller checks them.
 */
export function withCountersUsed(field: Pick<TemplateField, 'counterRows'>, value: FieldValue | undefined, uses: readonly number[]): FieldValue | null {
  const rows = shownCounterRows(field, value);
  if (!rows || rows.length !== uses.length) return null;
  return withCountersSet(field, value, rows.map((row, index) => ({ max: row.max, used: uses[index] ?? row.used })));
}

/**
 * The value with each row at the maximum and uses `counts` names for it, in the stored order; null
 * where the value is no list of counters or `counts` names another number of rows. Taken as given:
 * the caller checks them.
 */
export function withCountersSet(field: Pick<TemplateField, 'counterRows'>, value: FieldValue | undefined, counts: readonly Pick<CounterRow, 'max' | 'used'>[]): FieldValue | null {
  const rows = shownCounterRows(field, value);
  if (!rows || rows.length !== counts.length) return null;
  return changedRows(field, value, (row, index) => ({ ...row, ...counts[index] }));
}

/** The value with row `index` given back its uses by the recovery button `reset` (null: by none); null where nothing changes. */
export function withCounterReset(field: Pick<TemplateField, 'counterRows'>, value: FieldValue | undefined, index: number, reset: string | null): FieldValue | null {
  const row = shownCounterRows(field, value)?.[index];
  if (!row || row.reset === reset) return null;
  return changedRows(field, value, (each, at) => (at === index ? { ...each, reset } : each));
}
