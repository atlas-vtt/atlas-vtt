/**
 * Reads the layout and its blocks. A block of a type this Atlas does not know,
 * nested too deep, or lacking what its type needs (a Title without a field)
 * becomes an opaque block: it renders nothing and is written back exactly as
 * it was read.
 */

import type { BlockBase, TemplateBlock, TemplateLayout } from '../model/templateTypes';
import { BlockIdAllocator } from './blockIds';
import {
  ALIGNS, COLLAPSIBLE, DISPLAYS, HEADING_LEVELS, IMAGE_SHAPES, MAX_COLUMNS, NAME_STYLES, ORIENTATIONS, SIZES,
  SPELL_LOOKS, STAT_LOOKS, TAG_LOOKS, TITLE_LEVELS, TRACK_COUNTS, TRACK_LOOKS, WHEN_EMPTY, readCondition, readScoreColumn,
} from './blockParts';
import { LAYOUT_KEYS, blockKeys, isFileBlockType, type BlockKey, type FileBlockType } from './formatKeys';
import { describeValue, isRecord, jsonRecordCopy, own } from './jsonValues';
import { ObjectReader } from './objectReader';
import { JSON_OBJECT, asJsonRecord, asOneOf, asPositiveInteger, asPositiveNumber, asString, asTrue, choices } from './valueReads';

/** Deeper blocks are kept opaque: no real layout nests this far, and the serializer recurses. */
export const MAX_BLOCK_DEPTH = 32;

const TEXT = 'text';
/** A switch that is written only while it is on. */
const ON = 'true';
/** Block field references are text; '' is a block not yet bound to a field (`createBlock`), which the editor saves. */
const KEY = 'a field key';
const asFieldRef = asString;

export interface BlockContext {
  readonly problems: string[];
  readonly ids: BlockIdAllocator;
}

type BlockReader = ObjectReader<BlockKey>;
type WithoutId<T> = T extends unknown ? Omit<T, 'id'> : never;
type BodyOf<T extends FileBlockType> = WithoutId<Extract<TemplateBlock, { type: T }>>;
interface Missing { missing: BlockKey }
type BodyRead<T extends FileBlockType> = (r: BlockReader, children: () => TemplateBlock[]) => BodyOf<T> | Missing;

function withField<B>(r: BlockReader, build: (field: string) => B): B | Missing {
  const field = r.get('field', asFieldRef);
  return field === undefined ? { missing: 'field' } : build(field);
}

function oneOf<T extends string | number>(r: BlockReader, key: BlockKey, options: readonly [T, ...T[]]): T {
  return r.withDefault(key, asOneOf(options), options[0], choices(options));
}

function optionalOneOf<P extends BlockKey, T extends string>(r: BlockReader, key: P, options: readonly T[]): Partial<Record<P, T>> {
  return r.opt(key, asOneOf(options), choices(options));
}

const BODY_READERS: { [T in FileBlockType]: BodyRead<T> } = {
  section: (r, children) => ({
    type: 'section',
    ...r.opt('heading', asString, TEXT),
    ...r.opt('headingField', asFieldRef, KEY),
    ...optionalOneOf(r, 'collapsible', COLLAPSIBLE),
    blocks: children(),
  }),
  row: (r, children) => ({ type: 'row', ...optionalOneOf(r, 'align', ALIGNS), blocks: children() }),
  tabs: (r, children) => ({ type: 'tabs', ...r.opt('heading', asString, TEXT), blocks: children() }),
  title: (r) => withField(r, (field) => ({
    type: 'title', field, level: oneOf(r, 'level', TITLE_LEVELS), ...r.opt('pattern', asString, TEXT),
  })),
  line: (r) => {
    if (!Array.isArray(r.rawValue('fields'))) return { missing: 'fields' };
    return {
      type: 'line',
      fields: r.requiredList('fields', asFieldRef, 'field keys'),
      ...r.opt('pattern', asString, TEXT),
      ...r.opt('separator', asString, TEXT),
    };
  },
  stat: (r) => withField(r, (field) => ({
    type: 'stat',
    field,
    look: oneOf(r, 'look', STAT_LOOKS),
    ...r.opt('label', asString, TEXT),
    ...r.opt('pattern', asString, TEXT),
    ...optionalOneOf(r, 'display', DISPLAYS),
    ...r.opt('rollFrom', asFieldRef, KEY),
    ...r.opt('rollable', asTrue, ON),
    ...r.opt('addsToRolls', asTrue, ON),
  })),
  metric: (r) => {
    // A Metric holds at least one number; one without any is kept as it was read.
    const raw = r.rawValue('fields');
    const fields = Array.isArray(raw) && raw.length > 0 ? r.requiredList('fields', asFieldRef, 'field keys') : [];
    if (fields.length === 0) return { missing: 'fields' };
    return { type: 'metric', ...r.opt('heading', asString, TEXT), fields, ...r.opt('rollable', asTrue, ON), ...r.opt('addsToRolls', asTrue, ON) };
  },
  scores: (r) => withField(r, (field) => ({
    type: 'scores',
    field,
    orientation: oneOf(r, 'orientation', ORIENTATIONS),
    ...r.opt('perLine', asPositiveInteger, 'a whole number above 0'),
    ...optionalOneOf(r, 'display', DISPLAYS),
    ...r.optList('columns', (item, index) => readScoreColumn(item, index, r.where, r.problems), 'columns'),
    ...r.opt('rollable', asTrue, ON),
  })),
  tags: (r) => withField(r, (field) => ({
    type: 'tags', field, look: oneOf(r, 'look', TAG_LOOKS), ...r.opt('label', asString, TEXT),
  })),
  text: (r) => ({
    type: 'text', ...r.opt('field', asFieldRef, KEY), ...r.opt('text', asString, TEXT), ...r.opt('heading', asString, TEXT),
  }),
  entries: (r) => withField(r, (field) => ({
    type: 'entries',
    field,
    ...r.opt('heading', asString, TEXT),
    ...r.opt('introField', asFieldRef, KEY),
    ...optionalOneOf(r, 'nameStyle', NAME_STYLES),
    ...r.opt('addLabel', asString, TEXT),
  })),
  pairs: (r) => withField(r, (field) => ({
    type: 'pairs',
    field,
    ...r.opt('label', asString, TEXT),
    ...optionalOneOf(r, 'display', DISPLAYS),
    ...r.opt('rollable', asTrue, ON),
    ...r.opt('addsToRolls', asTrue, ON),
  })),
  track: (r) => withField(r, (field) => ({
    type: 'track',
    field,
    look: oneOf(r, 'look', TRACK_LOOKS),
    counts: oneOf(r, 'counts', TRACK_COUNTS),
    ...r.opt('label', asString, TEXT),
    ...r.opt('resource', asString, TEXT),
  })),
  counters: (r) => withField(r, (field) => ({ type: 'counters', field, ...r.opt('label', asString, TEXT) })),
  image: (r) => withField(r, (field) => ({ type: 'image', field, shape: oneOf(r, 'shape', IMAGE_SHAPES) })),
  spells: (r) => withField(r, (field) => ({
    type: 'spells', field, ...r.opt('heading', asString, TEXT), ...optionalOneOf(r, 'look', SPELL_LOOKS),
  })),
  heading: (r) => {
    const text = r.get('text', asString);
    return text === undefined ? { missing: 'text' } : { type: 'heading', text, level: oneOf(r, 'level', HEADING_LEVELS) };
  },
  divider: () => ({ type: 'divider' }),
  script: (r) => {
    const fs = r.get('fs', asJsonRecord);
    return fs === undefined ? { missing: 'fs' } : { type: 'script', summary: r.withDefault('summary', asString, '', TEXT), fs };
  },
};

function readBase(r: BlockReader): Omit<BlockBase, 'id'> {
  return {
    ...r.opt('showWhen', (value) => readCondition(value, r.where, r.problems), 'a condition'),
    ...optionalOneOf(r, 'whenEmpty', WHEN_EMPTY),
    ...r.opt('fallback', asString, TEXT),
    ...r.opt('className', asString, TEXT),
    ...optionalOneOf(r, 'size', SIZES),
    ...r.opt('fsExtras', asJsonRecord, JSON_OBJECT),
  };
}

function withId(body: WithoutId<TemplateBlock>, id: string | null, path: readonly number[], ctx: BlockContext): TemplateBlock {
  const block: TemplateBlock = { id: id ?? '', ...body };
  if (id === null) ctx.ids.defer(block, path);
  return block;
}

/** A block kept as it was read; its id is claimed only once it is known to be kept. */
function opaque(
  raw: Record<string, unknown>, path: readonly number[], ctx: BlockContext, problem: string, idOf: () => string | null,
): TemplateBlock | undefined {
  const copy = jsonRecordCopy(raw);
  if (copy === undefined) {
    ctx.problems.push(`${problem}; it cannot be kept and is left out.`);
    return undefined;
  }
  ctx.problems.push(`${problem}; it is kept as it is and not shown.`);
  return withId({ type: 'opaque', raw: copy }, idOf(), path, ctx);
}

function readChildren(r: BlockReader, path: readonly number[], ctx: BlockContext): TemplateBlock[] {
  return r.requiredList('blocks', (item, index) => parseBlock(item, [...path, index], ctx), null);
}

/** One block and everything inside it; undefined when it is no object or cannot be kept. */
export function parseBlock(raw: unknown, path: readonly number[], ctx: BlockContext): TemplateBlock | undefined {
  const where = `Block ${path.map((index) => index + 1).join('.')}`;
  if (!isRecord(raw)) {
    ctx.problems.push(`${where} is ${describeValue(raw)}, not a block; it is ignored.`);
    return undefined;
  }
  const claim = (): string | null => ctx.ids.claim(own(raw, 'id'), where);
  const type = own(raw, 'type');
  if (!isFileBlockType(type)) {
    return opaque(raw, path, ctx, `${where} has the type ${describeValue(type)}, which this version of Atlas does not know`, claim);
  }
  if (path.length > MAX_BLOCK_DEPTH) {
    return opaque(raw, path, ctx, `${where} (${type}) is nested more than ${MAX_BLOCK_DEPTH} blocks deep`, claim);
  }
  // Claimed before the children are read, so a block keeps its id ahead of every block inside it.
  const id = claim();
  const r = new ObjectReader(raw, `${where} (${type})`, ctx.problems, blockKeys(type));
  const body = BODY_READERS[type](r, () => readChildren(r, path, ctx));
  if ('missing' in body) return opaque(raw, path, ctx, `${where} (${type}) has no valid "${body.missing}"`, () => id);
  return withId(r.finish({ ...readBase(r), ...body }), id, path, ctx);
}

/** The layout, or undefined when the file's layout is no object. */
export function parseLayout(raw: unknown, ctx: BlockContext): TemplateLayout | undefined {
  if (!isRecord(raw)) return undefined;
  const r = new ObjectReader(raw, 'The layout', ctx.problems, LAYOUT_KEYS);
  const maxColumns = r.withDefault('maxColumns', asOneOf(MAX_COLUMNS), 2, choices(MAX_COLUMNS));
  const columnWidth = r.opt('columnWidth', asPositiveNumber, 'a positive number');
  const blocks = r.requiredList('blocks', (item, index) => parseBlock(item, [index], ctx), null);
  return r.finish({ maxColumns, ...columnWidth, blocks });
}
