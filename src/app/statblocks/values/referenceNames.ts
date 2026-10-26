/**
 * The names a statblock's `@` references can be written with, each with the number it reads now:
 * what typing `@` in a value offers. The names tried are every field by its key, what a field holds
 * one step in (`saves.dex`), every Table slot with each worked-out row of its Table (`str`,
 * `str.mod`), hit points (`hp`), and the fields the lookup also names by their label
 * (`fieldsByLabel`: `agi` for a field labelled Agi); the card's own lookup (`statblockLookup`)
 * decides which of them name a number, so every name offered reads what the card fills in. Pure.
 */

import { isHitPointsKey, normalizedKey } from '../../resources/resourceFields';
import { meaningsOf } from '../resolve/fieldMeanings';
import { withHeaderFields } from '../model/templateHeader';
import type { FieldValue, StatblockTemplate, TemplateField } from '../model/templateTypes';
import { isPairsList, readerFor, slotKeyOf, type FieldRecord } from './fieldValues';
import { formatNumber, parseNumberText } from './numberText';
import { referencePathAt } from './references';
import { fieldsByLabel, statblockLookup, tableColumns } from './statblockLookup';

/** A name a reference can be written with, and the number it reads, as the list shows it. */
export interface ReferenceName {
  readonly name: string;
  readonly value: string;
}

/** The most names one statblock offers. */
export const MAX_REFERENCE_NAMES = 256;
/** How many entries of a list or a record are offered one step in. */
const MAX_INSIDE = 32;

/** A name or label as a reference writes it: lower case, a hyphen for spaces, nothing a reference cannot hold. */
export function referenceWord(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]/g, '').replace(/^-+|-+$/g, '');
}

/** Whether `name` reads as one whole reference after an `@`. */
const isReferencePath = (name: string): boolean => name !== '' && referencePathAt(`@${name}`, 0) === name;

/** A name without case or separators in any of its parts: two names alike so read the same. */
const sameAs = (name: string): string => name.split('.').map(normalizedKey).join('.');

/** The number a value reads as, as the card shows it: a number, or a text that writes one as written (`+2`). */
function shownNumber(value: unknown): string | null {
  if (typeof value === 'number') return Number.isFinite(value) ? formatNumber(value) : null;
  if (typeof value !== 'string' || parseNumberText(value) === null) return null;
  return value.trim();
}

/** The names a field is tried by: its key and what it holds one step in (a pair by its label). */
function fieldNames(name: string, value: FieldValue | undefined): string[] {
  const inside = Array.isArray(value) ? (isPairsList(value) ? value.flatMap((pair) => Object.keys(pair ?? {})) : value.map((_, index) => String(index))).slice(0, MAX_INSIDE)
    : value !== null && typeof value === 'object' ? Object.keys(value).slice(0, MAX_INSIDE) : [];
  return [name, ...inside.map((part) => `${name}.${part}`)];
}

/** The names of a Table field's slots (as the card shows them, then by key), each alone and with every worked-out row of its Table. */
function slotNames(field: TemplateField, rows: readonly string[]): string[] {
  return (field.slots ?? []).flatMap((name, index) => [referenceWord(name), slotKeyOf(field, index)].flatMap((slot) => {
    if (slot === undefined || slot === '') return [];
    return [slot, ...rows.map((row) => `${slot}.${referenceWord(row)}`)];
  }));
}

/** A label as a reference writes it (`armor-class`), where that reads as the label the lookup names it by; else that name. */
function labelName(label: string, field: TemplateField): string {
  const word = referenceWord(field.label);
  return word.replace(/[-_]/g, '') === label ? word : label;
}

/**
 * Every name `@` can be followed by in this statblock, in the template's order, each once (names
 * alike without case or separators are one), with the number it reads now.
 */
export function referenceNames(template: StatblockTemplate, record: FieldRecord): ReferenceName[] {
  const { fields } = withHeaderFields(template);
  const lookup = statblockLookup(template, record, fields);
  const reader = readerFor(record, fields);
  const columns = tableColumns(template);
  const rowsOf = (field: TemplateField): string[] => (columns.get(field.key) ?? []).flatMap((column) => column.label ?? []);
  const tried = [
    ...fields.flatMap((field) => (field.type === 'scores' ? slotNames(field, rowsOf(field)) : fieldNames(field.key, reader(field.key)))),
    'hp',
    // A field by its label, where the lookup reads one (`fieldsByLabel`), last as the card reads it last;
    // a Table's slots are offered by their own names already
    ...[...fieldsByLabel(fields)].flatMap(([label, field]) => (field.type === 'scores' ? [] : fieldNames(labelName(label, field), reader(field.key)))),
  ];
  const names: ReferenceName[] = [];
  const seen = new Set<string>();
  for (const name of tried) {
    if (names.length >= MAX_REFERENCE_NAMES) break;
    const same = sameAs(name);
    if (seen.has(same) || !isReferencePath(name)) continue;
    seen.add(same);
    const value = shownNumber(lookup(name));
    if (value !== null) names.push({ name, value });
  }
  return names;
}

/**
 * The names that fit what was typed after the `@`, without case or separators: those that start
 * with it, then those that hold it, each in their order. Everything for nothing typed.
 */
export function namesFitting<T extends { readonly name: string }>(names: readonly T[], typed: string): T[] {
  const wanted = sameAs(typed);
  if (wanted === '') return [...names];
  const starting = names.filter((each) => sameAs(each.name).startsWith(wanted));
  return [...starting, ...names.filter((each) => !starting.includes(each) && sameAs(each.name).includes(wanted))];
}

/**
 * The template's fields a reference whose path starts with `name` may read, without case or
 * separators, whatever the note holds now: a field by its key or a key it had before a rename, a
 * Table field by one of its slots (name or key), a field by its label where the lookup reads it so
 * (`fieldsByLabel`), and for hit points' usual names the field the template means as hit points and
 * any keyed so.
 */
export function fieldsNamedBy(fields: readonly TemplateField[], name: string): TemplateField[] {
  const wanted = normalizedKey(name);
  const named = (each: string | undefined): boolean => each !== undefined && normalizedKey(each) === wanted;
  const byLabel = fieldsByLabel(fields).get(wanted);
  const hitPoints = isHitPointsKey(name) ? meaningsOf(fields)['hit-points'] : undefined;
  return fields.filter((field) => [field.key, ...(field.formerKeys ?? [])].some(named)
    || (field.type === 'scores' && (field.slots ?? []).some((slot, index) => named(slot) || named(slotKeyOf(field, index))))
    || field === byLabel
    || (isHitPointsKey(name) && (field.key === hitPoints || isHitPointsKey(field.key))));
}
