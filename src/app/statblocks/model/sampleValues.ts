import { pickText } from '../values/choicePicks';
import { sampleEntryTexts, sampleNumber, samplePairs, sampleText } from './sampleHints';
import { gridIsEmpty, templateGrid } from './tableGrid';
import type { EntryExtraShape, FieldKey, FieldValue, StatblockTemplate, TemplateField } from './templateTypes';

/**
 * Samples (§6.2): believable for what each field is for (`sampleHints.ts`),
 * never a property's name shown as its value, and never a creature's or a
 * rulebook's own text, so a built-in's preview stays free of either.
 */
const SAMPLE_DICE = '2d6 + 3';
const SAMPLE_HIT_DICE = '4d8 + 4';
const SAMPLE_RATING = '1';
const SAMPLE_PARAGRAPH = 'A few sentences about the creature, its habits and where it is found.';
const SAMPLE_ITEMS = ['Example one', 'Example two'];
const SAMPLE_SPELLS: FieldValue = [
  'The creature casts spells using Wisdom (save DC 12).',
  { 'At will': 'light, mage hand' },
  { '1/day each': 'cure wounds, sleep' },
];
const SAMPLE_GROUPS: FieldValue = [{ 'First group': 'one, two' }, { 'Second group': 'three' }];

function extraSample(extra: EntryExtraShape): FieldValue {
  const { type, label } = extra;
  switch (type) {
    case 'number': return /cost|action/i.test(label) ? 1 : 10;
    case 'dice': return SAMPLE_DICE;
    case 'list': return [...SAMPLE_ITEMS];
    case 'text': return /range/i.test(label) ? 'Close' : /kind|type/i.test(label) ? 'Action' : 'Example';
    case 'choice': return extra.options?.find((option) => option.trim()) ?? 'Example';
  }
}

/** What the samples hold: everything, or no numbers (the template editor, where numbers come from statblocks). */
export interface SampleOptions {
  numbers?: boolean;
}

/** Field types whose values are numbers, left empty where samples hold none. */
const NUMBER_TYPES: ReadonlySet<TemplateField['type']> = new Set(['number', 'rating', 'scores']);

function sampleEntries(field: TemplateField, numbers: boolean): FieldValue {
  const nameKey = field.entry?.nameKey ?? 'name';
  const textKey = field.entry?.textKey ?? 'desc';
  const extras = (field.entry?.extras ?? []).filter((extra) => numbers || extra.type !== 'number');
  return sampleEntryTexts(field).map(([name, text]) => {
    const entry: Record<string, FieldValue> = { [nameKey]: name };
    for (const extra of extras) entry[extra.key] = extraSample(extra);
    entry[textKey] = text;
    return entry;
  });
}

/** A table's sample: its starting table where it gives one, else for a row of numbers (ability scores) a row of them. */
function sampleTable(field: TemplateField): FieldValue {
  const start = templateGrid(field);
  if (start.rows.length > 1 || !gridIsEmpty(start)) return null;
  return (field.slots ?? []).map((_, index) => [14, 12, 13, 10, 11, 8][index % 6] ?? 10);
}

function sampleDice(field: TemplateField): string {
  return /hit dice|\bhd\b|hit_dice/i.test(`${field.key} ${field.label}`) ? SAMPLE_HIT_DICE : SAMPLE_DICE;
}

/** The number each sample pick of a numbered choice gets: one a distance or a count reads naturally as. */
const SAMPLE_PICK_NUMBERS = [60, 30];

function sampleChoice(field: TemplateField): FieldValue {
  const options = field.options ?? [];
  if (field.several || field.numbered) {
    const shown = (field.several ? options.slice(0, 2) : options.slice(0, 1))
      .map((option, index) => ({ option, number: field.numbered ? SAMPLE_PICK_NUMBERS[index] ?? null : null, unit: field.unit?.trim() ?? '' }));
    return shown.length > 0 ? shown.map(pickText).join(', ') : sampleText(field);
  }
  if (field.meaning === 'size' && options.includes('Medium')) return 'Medium';
  return options[0] ?? sampleText(field);
}

function sampleMarkdown(field: TemplateField): string {
  return /legendary/i.test(`${field.key} ${field.label}`)
    ? 'The creature can take 2 legendary actions, choosing from the options below.'
    : SAMPLE_PARAGRAPH;
}

/** Uses each sample row gets where its preset gives it none, so the preview shows its pips. */
const SAMPLE_COUNTER_MAXES = [4, 3, 2];

/** A Counters sample: its preset rows, each that has no uses yet given a few, else two rows of its own. */
function sampleCounters(field: TemplateField): FieldValue {
  const presets = field.counterRows ?? [];
  if (presets.length === 0) return [{ name: 'First', max: 3, used: 1 }, { name: 'Second', max: 2, used: 0 }];
  return presets.slice(0, SAMPLE_COUNTER_MAXES.length).map((row, index) => ({
    name: row.name,
    max: row.max > 0 ? row.max : SAMPLE_COUNTER_MAXES[index] ?? 1,
    used: index === 0 ? 1 : 0,
    ...(row.regain && { regain: row.regain }),
  }));
}

/** The value the template editor previews a field with while no statblock is picked. */
export function sampleValueFor(field: TemplateField, numbers = true): FieldValue {
  switch (field.type) {
    case 'number': return sampleNumber(field);
    case 'rating': return SAMPLE_RATING;
    case 'dice': return sampleDice(field);
    case 'text': return sampleText(field);
    case 'markdown': return sampleMarkdown(field);
    case 'choice': return sampleChoice(field);
    case 'list': return [...SAMPLE_ITEMS];
    case 'scores': return sampleTable(field);
    case 'entries': return sampleEntries(field, numbers);
    case 'pairs': return samplePairs(field);
    // The renderer shows a neutral silhouette for a missing image.
    case 'image': return null;
    case 'spells': return /spell|magic|cast/i.test(`${field.key} ${field.label}`) ? SAMPLE_SPELLS : SAMPLE_GROUPS;
    case 'counters': return sampleCounters(field);
  }
}

/** A sample for every field, overlaid with the template's own `sample`; without `numbers`, number fields stay empty, the template's samples too. */
export function sampleRecord(template: StatblockTemplate, { numbers = true }: SampleOptions = {}): Record<FieldKey, FieldValue> {
  const record: Record<FieldKey, FieldValue> = {};
  const numberKeys = new Set(template.fields.filter((field) => NUMBER_TYPES.has(field.type)).map((field) => field.key));
  for (const field of template.fields) {
    if (!numbers && numberKeys.has(field.key)) continue;
    record[field.key] = sampleValueFor(field, numbers);
  }
  const own = Object.entries(template.sample ?? {}).filter(([key]) => numbers || !numberKeys.has(key));
  return { ...record, ...Object.fromEntries(own) };
}
