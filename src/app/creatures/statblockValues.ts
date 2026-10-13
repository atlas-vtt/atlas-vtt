/**
 * Reading statblock values within limits.
 *
 * A statblock is not Atlas' own data. Its note may come in a bundle or a shared vault, and it
 * reaches Atlas through parsers that hand over lists and maps which hold each other, or
 * themselves, any number of times: a YAML alias is the same object wherever it stands. Followed
 * as it came, such a value has no end, or costs a thousand times the size of its note. So no walk
 * follows a statblock value as it came: `boundedValue` copies it into a tree of limited depth,
 * width and size, and whatever reads a statblock reads that.
 */

import { isRecord } from '../utils/guards';

/** Far beyond any statblock: one holds a few hundred values and some thousand characters. */
export const STATBLOCK_LIMITS = {
  /** Lists and maps inside each other. */
  depth: 6,
  /** Items read of one list, fields of one map. */
  entries: 200,
  /** Characters of a field's name; a longer one names no field. */
  key: 200,
  /** Characters of one text. What reads a text on (links, dice, options) may cost its length squared. */
  text: 10_000,
  /** Values written into one text. */
  textValues: 500,
  /** Values read of one statblock: every text, number, list and map. */
  values: 5_000,
  /** Characters read of one statblock, in texts and field names together. */
  characters: 50_000,
} as const;

/** How deep Fantasy Statblocks reads a value into a text. */
const TEXT_DEPTH = 5;

/** What is left to read of one statblock. Everything read of it shares one budget. */
export interface ReadBudget {
  values: number;
  characters: number;
  /** The fields read of each map. Listing a map costs its whole size, so each is listed once however often it is met. */
  readonly fields: Map<object, readonly string[]>;
}

export function readBudget(): ReadBudget {
  return { values: STATBLOCK_LIMITS.values, characters: STATBLOCK_LIMITS.characters, fields: new Map() };
}

/** The fields read of a map: not those that would stand in for what every object can do (`toString`, `__proto__`). */
function fieldsOf(map: object, budget: ReadBudget): readonly string[] {
  let fields = budget.fields.get(map);
  if (!fields) {
    fields = Object.keys(map)
      .filter((key) => key.length <= STATBLOCK_LIMITS.key && !(key in Object.prototype))
      .slice(0, STATBLOCK_LIMITS.entries);
    budget.fields.set(map, fields);
  }
  return fields;
}

/**
 * A copy of a statblock value that any walk can afford: a tree within `STATBLOCK_LIMITS`, of
 * texts, numbers, switches, lists and plain maps. A list or map met inside itself, or deeper than
 * the limit, is null in its place, so the entries after it keep their number; what comes after
 * the budget is spent is left out.
 */
export function boundedValue(value: unknown, budget: ReadBudget = readBudget()): unknown {
  /** The lists and maps the walk is inside of. */
  const open = new Set<object>();

  const copyOf = (part: unknown, depth: number): unknown => {
    if (budget.values <= 0) return undefined;
    budget.values -= 1;

    if (typeof part === 'string') {
      const text = part.slice(0, Math.max(Math.min(budget.characters, STATBLOCK_LIMITS.text), 0));
      budget.characters -= text.length;
      return text;
    }
    if (typeof part === 'number' || typeof part === 'boolean' || part === null) return part;
    if (typeof part !== 'object') return undefined;
    if (depth === STATBLOCK_LIMITS.depth || open.has(part)) return null;

    open.add(part);
    let copy: unknown[] | Record<string, unknown>;
    if (Array.isArray(part)) {
      copy = [];
      for (let index = 0; index < part.length && index < STATBLOCK_LIMITS.entries && budget.values > 0; index++) {
        copy.push(copyOf(part[index], depth + 1));
      }
    } else {
      copy = {};
      for (const field of fieldsOf(part, budget)) {
        if (budget.values <= 0 || budget.characters < field.length) break;
        budget.characters -= field.length;
        copy[field] = copyOf((part as Record<string, unknown>)[field], depth + 1);
      }
    }
    open.delete(part);
    return copy;
  };

  return copyOf(value, 0);
}

/** A bounded copy of a list; no list where the value is none. */
export function boundedList(value: unknown, budget?: ReadBudget): unknown[] {
  const copy = boundedValue(value, budget);
  return Array.isArray(copy) ? copy : [];
}

/** How a value is written as a text. */
export interface TextStyle {
  /** Between the items of the value itself, where it is a list. */
  joiner?: string;
  /** Whether the value itself, where it is a list, stands in parentheses. */
  parens?: boolean;
  /**
   * Fantasy Statblocks stores a trait's text with a map's fields beside their values and no
   * list in parentheses. Shown, a value has a map's values alone, and the lists inside it in
   * parentheses.
   */
  keyed?: boolean;
}

function textOf(value: unknown, joiner: string, parens: boolean, keyed: boolean, depth: number): string {
  if (depth === TEXT_DEPTH) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (value === null || typeof value !== 'object') return '';

  const inside = (item: unknown): string => textOf(item, ' ', !keyed, keyed, depth + 1);
  if (Array.isArray(value)) {
    const text = value.map(inside).join(joiner);
    return parens ? `(${text})` : text;
  }
  return (keyed ? Object.entries(value).flat() : Object.values(value)).map(inside).join(' ');
}

/** A text no longer than one text of a statblock may be, for where texts are joined before they are shown. */
export function boundedText(text: string): string {
  return text.slice(0, STATBLOCK_LIMITS.text);
}

/**
 * The text of a statblock value as Fantasy Statblocks writes it. The one way a statblock value
 * becomes a text: what is read for it has the limits of one text, within `budget` where a caller
 * shares the budget of a whole statblock.
 */
export function valueText(value: unknown, style: TextStyle = {}, budget: ReadBudget = readBudget()): string {
  const own: ReadBudget = {
    values: Math.min(budget.values, STATBLOCK_LIMITS.textValues),
    characters: Math.min(budget.characters, STATBLOCK_LIMITS.text),
    fields: budget.fields,
  };
  const before = { ...own };
  const copy = boundedValue(value, own);
  budget.values -= before.values - own.values;
  budget.characters -= before.characters - own.characters;

  const keyed = style.keyed ?? false;
  return boundedText(textOf(copy, style.joiner ?? ' ', style.parens ?? !keyed, keyed, 0));
}

/** The fields of a statblock as a bounded copy; none where the value is no map. */
export function boundedFields(statblock: unknown, budget?: ReadBudget): Record<string, unknown> {
  const copy = boundedValue(statblock, budget);
  return isRecord(copy) ? copy : {};
}

/**
 * A statblock as its readers take it: a bounded copy, named by a text. A creature is named in
 * places that take a text for granted; a name of several parts reads as a property of them does.
 */
export function boundedStatblock(statblock: Readonly<Record<string, unknown>>): Record<string, unknown> & { name?: string } {
  const copy = boundedFields(statblock);
  if (copy.name !== undefined && typeof copy.name !== 'string') copy.name = valueText(copy.name, { joiner: ', ', parens: false });
  return copy;
}

/** A bounded statblock that has a name, as a creature does; the name is empty where the statblock gives none. */
export function namedStatblock(statblock: Readonly<Record<string, unknown>>): Record<string, unknown> & { name: string } {
  const copy = boundedStatblock(statblock);
  return { ...copy, name: copy.name ?? '' };
}
