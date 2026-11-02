/**
 * The Fantasy Statblocks blocks that show values (§6.2): heading → Title,
 * subheading → Line, property → Stat, table → Scores, saves → Pairs,
 * traits → Entries, spells → Spells, text → Text, image → Image. Each key a
 * block names becomes a field of the type the block shows. A callback of a
 * known shape becomes a pattern or an option; any other keeps the block as a
 * script. FS keys Atlas has no place for go to `fsExtras`, for export.
 */

import { escapePatternText } from '../expressions/patternParse';
import { own } from '../format/jsonValues';
import { MODIFIER_FORMULA } from '../model/scoreFormulas';
import type { FieldKey, TemplateBlock } from '../model/templateTypes';
import {
  asScript, flags, full, hasCallback, headingOf, keysOf, refused, textOf, type FsRecord, type Heading, type Leaf,
} from './fsBlockParts';
import { callbackPattern, entryTextKey, modifierFormula, returnsItemUnchanged, type CallbackPattern } from './fsCallbackPatterns';
import { diceCallbackKey } from './fsDiceCallbacks';
import { lookupCallback } from './fsLookupCallbacks';
import { cleanLabel, FsFieldRegistry, type ImportContext } from './fsImportState';
import { t } from '../../i18n';

const SPELLCASTING = 'Spellcasting';

/** A block under a heading read from a field: a Section around it, as FS draws a section heading first. */
function underHeadingField(block: TemplateBlock, heading: Heading, ctx: ImportContext): TemplateBlock {
  return heading.headingField ? { id: ctx.nextId(), type: 'section', headingField: heading.headingField, blocks: [block] } : block;
}

/** A block's own label where it differs from its field's: FS writes "Difficulty:" where the field is "Difficulty". */
function ownLabel(record: FsRecord, key: FieldKey, ctx: ImportContext): { label?: string } {
  const display = textOf(record, 'display')?.trim();
  return display !== undefined && display !== ctx.fields.labelOf(key) ? { label: display } : {};
}

const heading: Leaf = (record, ctx, at) => {
  const keys = keysOf(record);
  const shown = keys.filter((key) => ctx.fields.use(key, 'text'));
  const refusedKey = keys.find((key) => !shown.includes(key));
  if (shown.length === 0) return refusedKey === undefined ? full([]) : refused(refusedKey);
  const size = own(record, 'size');
  const level = size === 2 ? 2 : typeof size === 'number' && size >= 3 ? 3 : 1;
  const read = typeof size !== 'number' || size <= 3 ? ['size'] : [];
  const titles = shown.map((field): TemplateBlock => ({ id: ctx.nextId(), type: 'title', field, level }));
  const base = flags(record, read, at);
  const [only] = titles;
  if (titles.length === 1 && only) return full([{ ...only, ...base }], shown[0]);
  const row: TemplateBlock = { id: ctx.nextId(), type: 'row', align: 'spread', blocks: titles, ...base };
  return full([at.parent === 'row' ? { id: ctx.nextId(), type: 'section', blocks: [row] } : row]);
};

const subheading: Leaf = (record, ctx, at) => {
  const keys = keysOf(record);
  const fields = keys.filter((key) => ctx.fields.use(key, 'text'));
  const refusedKey = keys.find((key) => !fields.includes(key));
  if (fields.length === 0) return refusedKey === undefined ? full([]) : refused(refusedKey);
  // FS joins with the separator as written; JavaScript joins with a comma where there is none
  const separator = textOf(record, 'separator') ?? ',';
  const joins = fields.length > 1 && separator !== ' ';
  const line: TemplateBlock = { id: ctx.nextId(), type: 'line', fields, ...(joins ? { separator } : {}), ...flags(record, ['separator'], at) };
  return full([line], fields.length === 1 ? fields[0] : undefined);
};

/** A callback that looks its value up in a table it writes out: the field and the pattern over the table it adds, else null. */
function lookedUp(callback: string, record: FsRecord, ctx: ImportContext): CallbackPattern | null {
  const found = lookupCallback(callback);
  if (!found || !FsFieldRegistry.usable(found.key)) return null;
  const table = ctx.lookups.add(cleanLabel(textOf(record, 'display')) ?? found.key, found.rows);
  return { pattern: `{${escapePatternText(found.key)}|lookup:${table}}`, refs: [found.key] };
}

/**
 * The field a property's dice roll from (`diceProperty`, or the field its
 * `diceCallback` picks where the line has none: `rollFrom`), and the keys that
 * says. A dice callback of another shape stays for export, as code.
 */
function rollSource(record: FsRecord, ctx: ImportContext): { rollFrom?: FieldKey; read: string[] } {
  const named = textOf(record, 'diceProperty');
  const callback = textOf(record, 'diceCallback')?.trim();
  const picked = callback ? diceCallbackKey(callback) : null;
  const rollFrom = named ?? picked ?? undefined;
  if (rollFrom === undefined || !ctx.fields.use(rollFrom, 'dice')) return { read: [] };
  return { rollFrom, read: [...(named !== undefined ? ['diceProperty'] : []), ...(picked === rollFrom ? ['diceCallback'] : [])] };
}

const property: Leaf = (record, ctx, at) => {
  const callback = hasCallback(record);
  const formatted = callback === undefined ? null : callbackPattern(callback) ?? lookedUp(callback, record, ctx);
  if (callback !== undefined && (!formatted || !formatted.refs.every((ref) => ctx.fields.mention(ref)))) return asScript(record, ctx, at);
  const keys = keysOf(record);
  const key = keys[0] ?? formatted?.refs[0];
  if (key === undefined) return { blocks: [], outcome: 'dropped', sentence: t('statblockEditor.fs.noKey') };
  const signed = formatted?.pattern === `{${escapePatternText(key)}|signed}`;
  if (!ctx.fields.use(key, signed ? 'number' : 'text', { label: textOf(record, 'display') })) return refused(key);
  for (const more of keys.slice(1)) ctx.fields.use(more, 'text');
  const plain = formatted === null || signed || formatted.pattern === `{${escapePatternText(key)}}`;
  // FS hides a conditioned line by its own key alone, though its callback reads others
  const readsOthers = own(record, 'conditioned') === true && formatted?.refs.some((ref) => ref !== key) === true;
  const { rollFrom, read: rollKeys } = rollSource(record, ctx);
  const stat: TemplateBlock = {
    id: ctx.nextId(), type: 'stat', field: key, look: 'run-in', ...ownLabel(record, key, ctx),
    ...(plain ? {} : { pattern: formatted.pattern }), ...(signed ? { display: 'signed' } : {}), ...(rollFrom ? { rollFrom } : {}),
    ...flags(record, ['display', 'callback', ...rollKeys], at),
    ...(readsOthers ? { showWhen: { field: key, is: 'present' } } : {}),
  };
  return full([stat], key);
};

const saves: Leaf = (record, ctx, at) => {
  const callback = hasCallback(record);
  if (callback !== undefined && !returnsItemUnchanged(callback)) return asScript(record, ctx, at);
  const key = keysOf(record)[0];
  if (key === undefined) return full([]);
  if (!ctx.fields.use(key, 'pairs', { label: textOf(record, 'display') })) return refused(key);
  const pairs: TemplateBlock = {
    id: ctx.nextId(), type: 'pairs', field: key, display: 'signed', ...ownLabel(record, key, ctx), ...flags(record, ['display', 'callback'], at),
  };
  return full([pairs], key);
};

const table: Leaf = (record, ctx, at) => {
  const key = keysOf(record)[0];
  if (key === undefined) return full([]);
  const headers = own(record, 'headers');
  const slots = Array.isArray(headers) ? headers.map((header) => (typeof header === 'string' ? header : String(header))) : [];
  if (!ctx.fields.use(key, 'scores', { slots: slots.length > 0 ? slots : undefined })) return refused(key);
  const calculates = own(record, 'calculate') === true;
  const modifier = textOf(record, 'modifier')?.trim();
  const formula = !calculates ? null : modifier ? modifierFormula(modifier) : MODIFIER_FORMULA;
  // A modifier left in JavaScript stays with `calculate` for export; FS ignores both without `calculate`
  const read = ['headers', ...(formula !== null ? ['calculate', 'modifier'] : calculates ? [] : ['calculate'])];
  const scores: TemplateBlock = {
    id: ctx.nextId(), type: 'scores', field: key, orientation: 'row',
    ...(formula ? { columns: [{ formula, display: 'signed' }] } : {}), ...flags(record, read, at),
  };
  if (calculates && formula === null) {
    return { blocks: [scores], outcome: 'partial', shows: key, sentence: t('statblockEditor.fs.jsModifiers', { name: ctx.fields.labelOf(key) ?? key }) };
  }
  return full([scores], key);
};

const traits: Leaf = (record, ctx, at) => {
  const callback = hasCallback(record);
  const textKey = callback === undefined ? undefined : entryTextKey(callback);
  if (callback !== undefined && !textKey) return asScript(record, ctx, at);
  const key = keysOf(record)[0];
  if (key === undefined) return full([]);
  const head = headingOf(record, ctx);
  const entry = textKey && textKey !== 'desc' ? { textKey } : undefined;
  if (!ctx.fields.use(key, 'entries', { label: head.heading, entry })) return refused(key);
  const entries: TemplateBlock = {
    id: ctx.nextId(), type: 'entries', field: key, ...(head.heading ? { heading: head.heading } : {}),
    ...flags(record, [...head.read, 'callback'], at),
  };
  const block = underHeadingField(entries, head, ctx);
  if (textOf(record, 'subheadingText')?.trim()) {
    return { blocks: [block], outcome: 'partial', shows: key, sentence: t('statblockEditor.fs.subheading', { name: ctx.fields.labelOf(key) ?? key }) };
  }
  return full([block], key);
};

const spells: Leaf = (record, ctx, at) => {
  const callback = hasCallback(record);
  if (callback !== undefined && !returnsItemUnchanged(callback)) return asScript(record, ctx, at);
  const key = keysOf(record)[0];
  if (key === undefined) return full([]);
  const head = textOf(record, 'heading')?.trim();
  if (!ctx.fields.use(key, 'spells', { label: head })) return refused(key);
  // FS names the first spell list "Spellcasting" where the block names it nothing (`heading ?? "Spellcasting"`), as the 5E built-ins head it
  const shown = textOf(record, 'heading') === undefined ? SPELLCASTING : head;
  const block: TemplateBlock = { id: ctx.nextId(), type: 'spells', field: key, ...(shown ? { heading: shown } : {}), ...flags(record, ['heading', 'callback'], at) };
  return full([block], key);
};

const text: Leaf = (record, ctx, at) => {
  const head = headingOf(record, ctx);
  const key = keysOf(record)[0];
  if (key !== undefined && !ctx.fields.use(key, 'markdown', { label: head.heading })) return refused(key);
  const written = textOf(record, 'text');
  // FS shows the block's own text where it has some, else the field
  const shown = written?.trim() ? { text: written } : key === undefined ? null : { field: key };
  const base = flags(record, ['text', ...head.read], at);
  if (shown === null || 'text' in shown) {
    // The template's own text is never empty
    delete base.whenEmpty;
    delete base.fallback;
  }
  if (!shown) return full(head.heading ? [{ id: ctx.nextId(), type: 'heading', text: head.heading, level: 'section', ...base }] : []);
  const block: TemplateBlock = { id: ctx.nextId(), type: 'text', ...shown, ...(head.heading ? { heading: head.heading } : {}), ...base };
  return full([underHeadingField(block, head, ctx)], 'field' in shown ? key : undefined);
};

const image: Leaf = (record, ctx, at) => {
  const keys = keysOf(record);
  const fields = keys.filter((key) => ctx.fields.use(key, 'image'));
  const refusedKey = keys.find((key) => !fields.includes(key));
  const [field] = fields;
  if (field === undefined) return refusedKey === undefined ? full([]) : refused(refusedKey);
  return full([{ id: ctx.nextId(), type: 'image', field, shape: 'token', ...flags(record, [], at) }], fields.length === 1 ? field : undefined);
};

/** The converter of each FS block type that shows values; a Map, so a type like "constructor" finds none. */
export const LEAF_BLOCKS: ReadonlyMap<string, Leaf> = new Map(Object.entries({ heading, subheading, property, saves, table, traits, spells, text, image }));
