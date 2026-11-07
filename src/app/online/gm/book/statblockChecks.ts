import { bookLine, MAX_BOOK_TITLE, MAX_SHEET_LIST, type BookStatblock, type SheetField, type SheetNode, type SheetRaw, type SheetValue } from '../../protocol/index.ts';
import type { ResolvedStatblock } from '../../../statblocks/model/resolvedTypes';
import { withHeaderFields } from '../../../statblocks/model/templateHeader';
import type { FieldValue, StatblockTemplate, TemplateField } from '../../../statblocks/model/templateTypes';
import type { NotePatch } from '../../../statblocks/notes/patchTypes';
import { referencesAgree, rollsWithReferences } from '../../../statblocks/values/diceValues';
import { splitRef, type FieldRead, type KeyedField } from '../../../statblocks/values/fieldValues';
import { namesReference, type FieldLookup } from '../../../statblocks/values/references';
import { fillReferences, namedReferences } from '../../../statblocks/values/fillReferences';
import { fieldsNamedBy } from '../../../statblocks/values/referenceNames';
import { keysRead, statblockLookup, tracedStatblockLookup } from '../../../statblocks/values/statblockLookup';
import { playerAccess, shownRecord } from './playerAccess.ts';
import type { WrittenValue } from './statblockSheets.ts';

/** What a player's statblock edit is checked against. */
export interface EditInputs {
  /** The note as it is drawn now: read through the resolver, with what was written since. */
  readonly resolved: ResolvedStatblock | null | undefined;
  /** The statblock this player was last sent, whose fields and lists they may change. */
  readonly sent: BookStatblock | null | undefined;
  /** What the note holds of a field now (`StatblockSheets.read`); undefined while it was not read. */
  readonly read: (field: KeyedField) => FieldRead | undefined;
}

/** A checked edit: the patches it is written with, and the values the note holds once they are in. */
export interface CheckedEdit {
  readonly patches: readonly NotePatch[];
  readonly written: readonly WrittenValue[];
}

/** The template of a native note a player may change: its template read as it was written, and a sheet that was sent editable. */
export function editableTemplate(inputs: EditInputs): StatblockTemplate | null {
  const { resolved, sent } = inputs;
  if (!resolved || !sent?.editable || resolved.source.kind !== 'atlas' || resolved.templateStatus !== 'ok') return null;
  return resolved.template;
}

/** The value a field holds once an edit is written under its key, taken from the key the note held it under. */
export function writtenValue(key: string, read: FieldRead, value: FieldValue | undefined): WrittenValue {
  return { key, cleared: read.key === key ? [] : [read.key], value };
}

/** A value that clears its field: its key is deleted, as the note pane does. */
export const clears = (value: SheetRaw): boolean => value === null || value === '' || (Array.isArray(value) && value.length === 0);

/** A line as a page writes it: already one clean line within a title's length. */
export const isLine = (value: unknown): value is string => typeof value === 'string' && bookLine(value, MAX_BOOK_TITLE) === value;

export const isScalar = (value: SheetRaw | undefined): value is string | number | boolean | null => value === null || typeof value !== 'object';

/** The most `@` references one text a player writes may name; a text naming more is refused. */
export const MAX_PLAYER_REFERENCES = 16;

/** What a player's `@` references are checked against (`playerReferences`). */
export interface PlayerReferences {
  /** The numbers they read: the card's lookup over the values the player may see (`shownRecord`), as their sheet's references are worked out. */
  readonly lookup: FieldLookup;
  /**
   * Whether a text the player wrote names nothing hidden from them. It names at most
   * `MAX_PLAYER_REFERENCES`; no reference names a hidden field by any name the lookup reads
   * (`fieldsNamedBy`), even one the note holds nothing of now; each reads the same field over the
   * values they may see as over the whole note, and is not cut short in either (`referencesAgree`);
   * and every key a reference reads, those the values it names read included, is a field of the
   * template the player may see. A reference that reads nothing (`Ask @DM`) is prose.
   */
  safe(text: string): boolean;
}

/** The paths a text's references may read, each `@` with every shorter path the lookup tries after its whole one. */
function referencePaths(text: string): string[] {
  const paths: string[] = [];
  fillReferences(text, (path) => {
    paths.push(path);
    return undefined;
  });
  return paths;
}

/** What a player's `@` references read, and whether one they wrote names only what they may see. */
export function playerReferences(inputs: EditInputs, template: StatblockTemplate): PlayerReferences {
  const { fields } = withHeaderFields(template);
  const record = inputs.resolved?.fields ?? {};
  const shown = shownRecord(record, template, fields);
  const visible = (field: TemplateField): boolean => playerAccess(template, field.key) !== 'hidden';
  const hidden = (path: string): boolean => fieldsNamedBy(fields, path.split('.')[0] ?? '').some((field) => !visible(field));
  // A key read is the player's only where it is a shown field's key or one it had, whole or before a dotted index
  const fieldOf = (key: string): TemplateField | undefined => fields.find((field) => field.key === key || (field.formerKeys ?? []).includes(key));
  const shownKey = (key: string): boolean => {
    const field = fieldOf(key) ?? fieldOf(splitRef(key).key);
    return field !== undefined && visible(field);
  };
  const safe = (text: string): boolean => {
    if (!namesReference(text)) return true;
    if (namedReferences(text).length > MAX_PLAYER_REFERENCES) return false;
    const paths = referencePaths(text);
    if (paths.some(hidden)) return false;
    // Fresh lookups for each text, so one text's budget is never spent by another's
    const seen = tracedStatblockLookup(template, shown, fields);
    const all = tracedStatblockLookup(template, record, fields);
    const readsShown = paths.every((path) => [seen(path), all(path)].every((answer) => keysRead(answer.trace).every(shownKey)));
    return readsShown && referencesAgree(text, seen, all);
  };
  return { lookup: statblockLookup(template, shown, fields), safe };
}

/** Whether every text a player wrote into a value, at any depth, names nothing hidden from them (`PlayerReferences.safe`). */
export function referencesSafeIn(value: unknown, references: PlayerReferences): boolean {
  if (typeof value === 'string') return references.safe(value);
  if (Array.isArray(value)) return value.every((item: unknown) => referencesSafeIn(item, references));
  if (value === null || typeof value !== 'object') return true;
  return Object.values(value).every((item: unknown) => referencesSafeIn(item, references));
}

/**
 * Dice a line writes, which Atlas rolls once its references are filled in from what the player may
 * see (`playerReferences`). A reference that names no number there, or anything hidden from them,
 * refuses it; the text is stored as written.
 */
export const isDice = (value: unknown, references: PlayerReferences): value is string =>
  isLine(value) && rollsWithReferences(value, references.lookup) && references.safe(value);

/** Several options in the options' order, each once; an open choice may name others after them. */
export function inOptionOrder(value: SheetRaw, options: readonly string[], open: boolean): value is readonly string[] {
  if (!Array.isArray(value) || value.length > MAX_SHEET_LIST) return false;
  let last = -1;
  let own = false;
  const seen = new Set<string>();
  for (const pick of value) {
    if (!isLine(pick) || seen.has(pick)) return false;
    seen.add(pick);
    const at = options.indexOf(pick);
    if (at < 0 ? !open : own || at <= last) return false;
    if (at < 0) own = true;
    else last = at;
  }
  return true;
}

/** One option of a choice, or what the player wrote where the choice is open or has no options. */
export const amongOptions = (value: SheetRaw, options: readonly string[] | undefined, open: boolean): boolean =>
  isLine(value) && (open || options === undefined || options.length === 0 || options.includes(value));

/** A list of plain values, each a line or a number. */
export const isPlainList = (value: SheetRaw): value is readonly (string | number)[] =>
  Array.isArray(value) && value.length <= MAX_SHEET_LIST && value.every((item: SheetRaw) => isLine(item) || typeof item === 'number');

/** Every value of a sent statblock the player may change, wherever the sheet shows it. */
export function sentFields(statblock: BookStatblock): SheetField[] {
  const fields: SheetField[] = [];
  const ofValue = (value: SheetValue | undefined): void => void (value?.field && fields.push(value.field));
  const walk = (nodes: readonly SheetNode[]): void => {
    for (const node of nodes) {
      if (node.k === 'section' || node.k === 'row') walk(node.nodes);
      else if (node.k === 'tabs') for (const tab of node.tabs) walk(tab.nodes);
      else if (node.k === 'value') ofValue(node.value);
      else if (node.k === 'metric') node.values.forEach(ofValue);
      else if ((node.k === 'table' || node.k === 'track' || node.k === 'counters') && node.field !== null) fields.push(node.field);
    }
  };
  Object.values(statblock.sigils).forEach(ofValue);
  walk(statblock.blocks);
  return fields;
}

