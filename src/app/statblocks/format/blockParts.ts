/** The small parts of blocks: the choices their keys offer, conditions and score columns. */

import type {
  BlockBase,
  Condition,
  RowBlock,
  ScoreColumn,
  ScoresBlock,
  SectionBlock,
  StatBlock,
  TagsBlock,
  TemplateLayout,
  TitleBlock,
  TrackBlock,
  ImageBlock,
  HeadingBlock,
  EntriesBlock,
  SpellsBlock,
} from '../model/templateTypes';
import { CONDITION_KEYS, SCORE_COLUMN_KEYS } from './formatKeys';
import { isRecord } from './jsonValues';
import { ObjectReader } from './objectReader';
import { asOneOf, asString, choices } from './valueReads';

export const WHEN_EMPTY = ['hide', 'fallback', 'fold'] as const satisfies readonly NonNullable<BlockBase['whenEmpty']>[];
export const SIZES = ['fit', 'fill'] as const satisfies readonly NonNullable<BlockBase['size']>[];
export const DISPLAYS = ['plain', 'signed'] as const satisfies readonly NonNullable<StatBlock['display']>[];
export const COLLAPSIBLE = ['open', 'closed'] as const satisfies readonly NonNullable<SectionBlock['collapsible']>[];
export const ALIGNS = ['start', 'center', 'spread'] as const satisfies readonly NonNullable<RowBlock['align']>[];
export const NAME_STYLES = ['run-in', 'heading'] as const satisfies readonly NonNullable<EntriesBlock['nameStyle']>[];
export const SPELL_LOOKS = ['lines', 'tabs'] as const satisfies readonly NonNullable<SpellsBlock['look']>[];
export const MAX_COLUMNS = [1, 2, 3] as const satisfies readonly TemplateLayout['maxColumns'][];

/** Required choices; the first is what an absent or unreadable value reads as, as `createBlock` makes them. */
export const TITLE_LEVELS = [1, 2, 3] as const satisfies readonly TitleBlock['level'][];
export const STAT_LOOKS = ['run-in', 'stacked'] as const satisfies readonly StatBlock['look'][];
export const ORIENTATIONS = ['row', 'table'] as const satisfies readonly ScoresBlock['orientation'][];
export const TAG_LOOKS = ['comma', 'chips', 'bullets', 'numbered'] as const satisfies readonly TagsBlock['look'][];
export const TRACK_LOOKS = ['boxes', 'gauge'] as const satisfies readonly TrackBlock['look'][];
export const TRACK_COUNTS = ['down', 'up'] as const satisfies readonly TrackBlock['counts'][];
export const IMAGE_SHAPES = ['token', 'portrait'] as const satisfies readonly ImageBlock['shape'][];
export const HEADING_LEVELS = ['section', 'minor'] as const satisfies readonly HeadingBlock['level'][];

const PRESENCE = ['present', 'absent'] as const;
const EQUALITY = ['equal', 'not-equal'] as const;
const COMPARISON = ['above', 'below'] as const;
const CONDITION_TESTS = [...PRESENCE, ...EQUALITY, ...COMPARISON] as const satisfies readonly Condition['is'][];

function asComparable(value: unknown): string | number | boolean | undefined {
  if (typeof value === 'string' || typeof value === 'boolean') return value;
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/** A `showWhen` condition, or undefined when its field, test or value does not fit together. */
export function readCondition(raw: unknown, where: string, problems: string[]): Condition | undefined {
  if (!isRecord(raw)) return undefined;
  const r = new ObjectReader(raw, `${where} › showWhen`, problems, CONDITION_KEYS);
  const field = r.get('field', asString);
  const is = r.get('is', asOneOf(CONDITION_TESTS));
  if (field === undefined || is === undefined) return undefined;
  if (is === 'present' || is === 'absent') {
    const unused = r.rawValue('value');
    if (unused !== undefined) r.keep('value', unused, undefined, null);
    return r.finish({ field, is });
  }
  if (is === 'equal' || is === 'not-equal') {
    const value = r.get('value', asComparable);
    return value === undefined ? undefined : r.finish({ field, is, value });
  }
  const limit = r.get('value', asNumber);
  return limit === undefined ? undefined : r.finish({ field, is, value: limit });
}

export function readScoreColumn(raw: unknown, index: number, where: string, problems: string[]): ScoreColumn | undefined {
  if (!isRecord(raw)) return undefined;
  const r = new ObjectReader(raw, `${where} › column ${index + 1}`, problems, SCORE_COLUMN_KEYS);
  return r.finish({
    ...r.opt('label', asString, 'text'),
    ...r.opt('field', asString, 'a field key'),
    ...r.opt('formula', asString, 'text'),
    ...r.opt('display', asOneOf(DISPLAYS), choices(DISPLAYS)),
  });
}
