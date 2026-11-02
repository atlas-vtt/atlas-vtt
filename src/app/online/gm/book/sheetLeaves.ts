import {
  bookLine, isResourceKey, MAX_BOOK_TITLE, MAX_COUNTER, MAX_COUNTERS, MAX_FORMULA, MAX_SHEET_LIST, MAX_TABLE_COLUMNS, MAX_TABLE_ROWS,
  type SheetCounter, type SheetField, type SheetNode, type SheetPair, type SheetValue,
} from '../../protocol/index.ts';
import { valuePrompt, type BlockDisplay } from '../../../statblocks/render/blockDisplay';
import { MAX_TRACK_BOXES } from '../../../statblocks/render/values/trackBoxes';
import { metricNumberText } from '../../../statblocks/render/values/blockText';
import { shownTable } from '../../../statblocks/render/values/shownTable';
import type { CountersBlock, FieldKey, MetricBlock, ScoresBlock, TemplateBlock, TrackBlock } from '../../../statblocks/model/templateTypes';
import { shownCounterRows, type CounterRow } from '../../../statblocks/values/counterValues';
import { listItems } from '../../../statblocks/values/listText';
import { numericValue } from '../../../statblocks/values/numberText';
import { normalisePairs, pairText } from '../../../statblocks/values/pairValues';
import { valueMisfit } from '../../../statblocks/values/valueFit';
import { valueText } from '../../../statblocks/values/valueText';
import { clippedLine } from './bookTexts.ts';
import { playerAccess } from './playerAccess.ts';
import { sheetFieldOf, type SheetBuild } from './sheetFields.ts';
import { cellRolls, rollableBlock, sheetRoll } from './sheetRolls.ts';

/** The most numbers one Metric holds on a sheet. */
const MAX_METRIC_NUMBERS = 6;

type Look = SheetValue['look'];

/** What a value carries besides its text: its words, pairs or resource, and whether its block rolls its number as a bonus. */
type ValueExtra = Partial<Pick<SheetValue, 'words' | 'pairs' | 'resource'>> & { readonly rollable?: boolean };

/**
 * A value as the sheet shows it, its label and lines cut to what a page takes. A plain value
 * carries what a click on it rolls, where the card's link rolls the whole value (`sheetRoll`).
 */
export function sheetValue(build: SheetBuild, label: string | null | undefined, text: string, look: Look, field: SheetField | null, prompt: string | null, { rollable = false, ...extra }: ValueExtra = {}): SheetValue {
  const roll = look === 'plain' ? sheetRoll(text, rollable, build.shown.namedRolls) : null;
  return {
    label: clippedLine(label, MAX_BOOK_TITLE),
    look,
    text: build.texts.of(text),
    field,
    prompt: clippedLine(prompt, MAX_BOOK_TITLE),
    ...extra,
    ...(roll !== null && { roll }),
  };
}

/** The text a Title, Line or Stat writes, or what stands in for it; a prompt stands where nothing shows. */
export function displayText(display: BlockDisplay): string {
  return display.state === 'prompt' ? '' : display.text?.text ?? '';
}

/** The prompt a block shows where it is empty, else null. */
export const promptOf = (display: BlockDisplay): string | null => (display.state === 'prompt' ? display.prompt : null);

/** A block's value as one plain text, with its prompt where it is empty; `rollable` where its block rolls its number as a bonus. */
export function plainValue(build: SheetBuild, label: string | null, display: BlockDisplay, field: SheetField | null, rollable = false): SheetValue {
  return sheetValue(build, label, displayText(display), 'plain', field, promptOf(display), { rollable });
}

const plainNode = (build: SheetBuild, label: string | null, display: BlockDisplay, field: SheetField | null, rollable = false): SheetNode => ({ k: 'value', value: plainValue(build, label, display, field, rollable) });

/** The resource key a tracked number's value carries, where the sheet holds a value of it; else nothing. */
function trackedResource(build: SheetBuild, key: FieldKey): Pick<SheetValue, 'resource'> {
  const tracked = build.shown.tracked.get(key);
  return tracked && isResourceKey(tracked.key) && build.resources[tracked.key] ? { resource: tracked.key } : {};
}

/** The label a block shows its value under: its own, else its field's, else its key. */
export function labelOf(build: SheetBuild, block: { label?: string | undefined; field: string }): string {
  return block.label ?? build.shown.fields.get(block.field)?.label ?? block.field;
}

/** A field's value written as it is, where it is not what its field holds (its type changed). */
function misfitText(build: SheetBuild, key: string): string | null {
  const field = build.shown.fields.get(key);
  const value = build.shown.reader(key);
  return field && valueMisfit(field, value) ? valueText(value) : null;
}

function wordsNode(build: SheetBuild, block: Extract<TemplateBlock, { type: 'tags' }>, display: BlockDisplay, field: SheetField | null): SheetNode {
  const label = block.look === 'comma' ? labelOf(build, block) : block.label ?? null;
  if (display.state !== 'value') return plainNode(build, label, display, field);
  const words = listItems(build.shown.reader(block.field)).slice(0, MAX_SHEET_LIST).flatMap((item) => clippedLine(item, MAX_BOOK_TITLE) ?? []);
  return { k: 'value', value: sheetValue(build, label, words.join(', '), 'words', field, null, { words }) };
}

function pairsNode(build: SheetBuild, block: Extract<TemplateBlock, { type: 'pairs' }>, display: BlockDisplay, field: SheetField | null): SheetNode {
  const label = labelOf(build, block);
  if (display.state !== 'value') return plainNode(build, label, display, field);
  const value = build.shown.reader(block.field);
  const found = normalisePairs(value);
  if (found.length === 0) return { k: 'value', value: sheetValue(build, label, valueText(value), 'plain', field, null) };
  const signed = block.display === 'signed';
  const rollable = rollableBlock(block);
  const pairs = found.slice(0, MAX_SHEET_LIST).flatMap((pair): SheetPair[] => {
    const name = clippedLine(pairText({ key: pair.key, value: '' }, false), MAX_BOOK_TITLE) ?? '';
    const shown = clippedLine(pairText({ key: '', value: pair.value }, signed), MAX_BOOK_TITLE) ?? '';
    const roll = sheetRoll(shown, rollable, build.shown.namedRolls);
    return name === '' && shown === '' ? [] : [{ label: name, value: shown, ...(roll !== null && { roll }) }];
  });
  return { k: 'value', value: sheetValue(build, label, found.map((pair) => pairText(pair, signed)).join(', '), 'pairs', field, null, { pairs }) };
}

function metricNode(build: SheetBuild, block: MetricBlock, display: BlockDisplay): SheetNode | null {
  const numbers = block.fields.filter((key) => key !== '' && playerAccess(build.template, key) !== 'hidden').slice(0, MAX_METRIC_NUMBERS);
  const heading = clippedLine(numbers.length > 1 ? block.heading : undefined, MAX_BOOK_TITLE);
  if (display.state === 'fallback') return { k: 'metric', heading, values: [plainValue(build, null, display, null)] };
  const values = numbers.map((key) => {
    const field = sheetFieldOf(build, key);
    const text = metricNumberText(key, build.shown).text;
    const known = build.shown.fields.get(key);
    const label = known?.label ?? key;
    return sheetValue(build, label, text, 'plain', field, text.trim() === '' && field ? valuePrompt(known, label) : null, { rollable: rollableBlock(block), ...trackedResource(build, key) });
  });
  return values.length > 0 ? { k: 'metric', heading, values } : null;
}

function tableNode(build: SheetBuild, block: ScoresBlock, display: BlockDisplay, field: SheetField | null): SheetNode | null {
  const shown = shownTable(block, display, build.shown);
  if (!shown) {
    const text = display.state === 'value' ? misfitText(build, block.field) : displayText(display);
    return text === null ? null : { k: 'value', value: sheetValue(build, labelOf(build, { field: block.field }), text, 'plain', field, promptOf(display)) };
  }
  const fits = shown.grid.rows.length <= MAX_TABLE_ROWS && shown.grid.columns.length <= MAX_TABLE_COLUMNS;
  const texts = (rows: readonly (readonly { text: string }[])[]): string[][] => rows.slice(0, MAX_TABLE_ROWS)
    .map((row) => row.slice(0, MAX_TABLE_COLUMNS).map((cell) => cell.text));
  const cells = (rows: readonly (readonly string[])[]): (string | null)[][] => rows.map((row) => row.map((text) => clippedLine(text, MAX_BOOK_TITLE)));
  const rowTexts = texts(shown.cells);
  const workedTexts = texts(shown.derived.map((row) => row.cells));
  const rows = cells(rowTexts);
  const worked = cells(workedTexts);
  const rollable = rollableBlock(block);
  const rolls = cellRolls(rowTexts, rows, rollable, build.shown.namedRolls);
  const workedRolls = cellRolls(workedTexts, worked, rollable, build.shown.namedRolls);
  const labels = shown.derived.slice(0, MAX_TABLE_ROWS).map((row) => clippedLine(row.label, MAX_BOOK_TITLE) ?? '');
  return {
    // The card names a Table by its columns alone.
    k: 'table',
    label: null,
    columns: shown.grid.columns.slice(0, MAX_TABLE_COLUMNS).map((column, index) => clippedLine(column.name, MAX_BOOK_TITLE) ?? `${index + 1}`),
    rows,
    worked,
    ...(labels.some((label) => label !== '') && { workedLabels: labels }),
    ...(rolls && { rolls }),
    ...(workedRolls && { workedRolls }),
    field: fits ? field : null,
  };
}

function trackNode(build: SheetBuild, block: TrackBlock, display: BlockDisplay, field: SheetField | null): SheetNode | null {
  const label = clippedLine(labelOf(build, block), MAX_BOOK_TITLE);
  if (display.state !== 'value') return plainNode(build, label, display, field);
  const resource = block.resource ?? trackedResource(build, block.field).resource;
  const held = resource !== undefined && isResourceKey(resource) ? build.resources[resource] : undefined;
  const max = numericValue(build.shown.reader(block.field));
  if (held && held.max > 0) {
    // A tracked number counts the way its field says, which its value follows
    const counts = block.resource === undefined ? build.shown.tracked.get(block.field)?.counts ?? block.counts : block.counts;
    return track(block, label, held.current, held.max, resource ?? null, counts);
  }
  // A Track's field is its maximum, which its boxes must never write: it shows where it starts (#522)
  if (max !== null && max > 0) return track(block, label, block.counts === 'down' ? Math.floor(max) : 0, Math.floor(max), null);
  const text = misfitText(build, block.field);
  return text === null ? null : { k: 'value', value: sheetValue(build, label, text, 'plain', field, null) };
}

/** A track as the page draws it: it sets its resource where it shows one, and never its field, which holds its maximum. */
function track(block: TrackBlock, label: string | null, current: number, max: number, resource: string | null, counts = block.counts): SheetNode {
  const look = block.look === 'boxes' && max <= MAX_TRACK_BOXES ? 'boxes' : 'gauge';
  return { k: 'track', label, look, counts, current: Math.max(0, Math.min(current, max)), max, resource, field: null };
}

/** Whether the protocol carries a line exactly as it is written. */
export const carriedLine = (text: string, max: number = MAX_BOOK_TITLE): boolean => bookLine(text, max) === text;

/** A row as the page takes it; null where the protocol cannot carry it as it is (a name, recovery button or formula it would change, too many uses). */
function sheetCounter(row: CounterRow): SheetCounter | null {
  if (!carriedLine(row.name) || (row.reset !== null && !carriedLine(row.reset)) || (row.regain !== null && !carriedLine(row.regain, MAX_FORMULA)) || row.max > MAX_COUNTER) return null;
  return { name: row.name, max: row.max, used: row.used, reset: row.reset, regain: row.regain };
}

/**
 * A Counters block: every row as the note holds it (or the template's preset rows, where it holds
 * none), rows without uses included, so the page writes back the whole list in the note's order.
 * Where the protocol cannot carry the rows exactly (too many, a name it would clean), or the value
 * is no list of counters, the value is shown as written and never changed.
 */
function countersNode(build: SheetBuild, block: CountersBlock, display: BlockDisplay, field: SheetField | null): SheetNode | null {
  const label = clippedLine(labelOf(build, block), MAX_BOOK_TITLE);
  if (display.state === 'fallback') return plainNode(build, label, display, null);
  if (display.state !== 'value') return null;
  const known = build.shown.fields.get(block.field);
  const value = build.shown.reader(block.field);
  const rows = known ? shownCounterRows(known, value) : null;
  const counters = rows && rows.length <= MAX_COUNTERS ? rows.map(sheetCounter) : null;
  if (!counters?.every((row): row is SheetCounter => row !== null)) return { k: 'value', value: sheetValue(build, label, valueText(value), 'plain', null, null) };
  return { k: 'counters', label, counters, field };
}

/** What a player may change of the field a block shows: nothing where its fallback stands in for the field's value. */
export function shownFieldOf(build: SheetBuild, key: FieldKey, block: TemplateBlock, display: BlockDisplay): SheetField | null {
  return display.state === 'fallback' ? null : sheetFieldOf(build, key, block);
}

/**
 * One block of the layout that shows values, as the sheet draws it (`display`: as the card shows
 * it, or the prompt the note's panel shows where it is empty and the player may fill it in). Null
 * for a block the sheet does not draw: a picture, nothing to show.
 */
export function leafNode(build: SheetBuild, block: TemplateBlock, display: BlockDisplay): SheetNode | null {
  switch (block.type) {
    case 'title': case 'line': {
      const key = block.type === 'title' ? block.field : block.fields[0];
      const field = key === undefined ? null : shownFieldOf(build, key, block, display);
      return plainNode(build, null, display, field);
    }
    case 'stat': {
      const value = plainValue(build, labelOf(build, block), display, shownFieldOf(build, block.field, block, display), rollableBlock(block));
      return { k: 'value', value: { ...value, ...trackedResource(build, block.field) } };
    }
    case 'tags': return wordsNode(build, block, display, shownFieldOf(build, block.field, block, display));
    case 'pairs': return pairsNode(build, block, display, shownFieldOf(build, block.field, block, display));
    case 'metric': return metricNode(build, block, display);
    case 'scores': return tableNode(build, block, display, shownFieldOf(build, block.field, block, display));
    case 'track': return trackNode(build, block, display, shownFieldOf(build, block.field, block, display));
    case 'counters': return countersNode(build, block, display, shownFieldOf(build, block.field, block, display));
    case 'text': {
      const field = block.field === undefined ? null : shownFieldOf(build, block.field, block, display);
      const text = display.state === 'value' ? (block.field ? valueText(build.shown.reader(block.field)) : block.text ?? '') : displayText(display);
      return { k: 'value', value: sheetValue(build, block.heading?.trim() || null, text, 'markdown', field, promptOf(display)) };
    }
    case 'heading': {
      const text = clippedLine(block.text, MAX_BOOK_TITLE);
      return text === null ? null : { k: 'heading', text, minor: block.level === 'minor' };
    }
    case 'divider': return { k: 'divider' };
    default: return null;
  }
}
