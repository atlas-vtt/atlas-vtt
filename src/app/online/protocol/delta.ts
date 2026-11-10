import { MAX_FOG_OPERATIONS } from './fog.ts';
import type { JsonRecord } from './lighting.ts';
import { MAX_SCENE_ID } from './moves.ts';
import { isRecord } from './shape.ts';
import { TOKEN_ID_PATTERN } from './tokens.ts';

/**
 * The messages players follow by sequence number: each goes out whole (`seq` on the message) on a
 * scene change, to a player who joins or asks, and whenever a delta would not be smaller; in between
 * as `delta` messages, each from the one before (`seq` one higher).
 */
export type DeltaOf = 'tokens' | 'sight' | 'fog';

/** The fields of each sequenced message that are lists of entries known by `id`. */
export const DELTA_LISTS: Readonly<Record<DeltaOf, readonly string[]>> = { tokens: ['tokens'], sight: ['tokens', 'lights'], fog: ['fog'] };

export const isDeltaOf = (value: unknown): value is DeltaOf => value === 'tokens' || value === 'sight' || value === 'fog';

/** Fields a delta never sets: they name the message, not its content. */
const FRAMING = ['t', 'scene', 'seq'];

/** Entries one list delta may name: as many as the largest list of a sequenced message (fog). */
const MAX_DELTA_ENTRIES = MAX_FOG_OPERATIONS;

/** Changes to a list of entries known by `id`. */
export interface ListDelta {
  /** The changed fields of entries kept, each with the entry's id. */
  readonly patch?: readonly JsonRecord[];
  /** Entries added, or replaced whole because a field went away; a new one goes to the end. */
  readonly put?: readonly JsonRecord[];
  /** The ids of entries removed. */
  readonly drop?: readonly string[];
  /** Every id in the new order, when that is not the old order with new entries at the end. */
  readonly order?: readonly string[];
}

/** The change from one sequenced message to the next. */
export interface DeltaMessage {
  readonly t: 'delta';
  readonly of: DeltaOf;
  readonly scene: string;
  /** One more than the message it applies to. */
  readonly seq: number;
  readonly lists?: Readonly<Record<string, ListDelta>>;
  /** Other fields that changed, whole. */
  readonly set?: JsonRecord;
  /** Fields that went away. */
  readonly unset?: readonly string[];
}

/** What changes a message's content: a delta without its framing. */
export type DeltaChanges = Pick<DeltaMessage, 'lists' | 'set' | 'unset'>;

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);
const idOf = (entry: unknown): string | null => (isRecord(entry) && typeof entry.id === 'string' ? entry.id : null);

/** The entries of a list by id, in order; null when one has no id or two share one. */
function byId(list: unknown): Map<string, JsonRecord> | null {
  if (!Array.isArray(list)) return null;
  const entries = new Map<string, JsonRecord>();
  for (const entry of list) {
    const id = idOf(entry);
    if (id === null || entries.has(id) || !isRecord(entry)) return null;
    entries.set(id, entry);
  }
  return entries;
}

/** The change from one list to the next, or null when either is no list of entries with ids of their own. */
function listDelta(previous: unknown, next: unknown): ListDelta | null {
  const before = byId(previous);
  const after = byId(next);
  if (before === null || after === null) return null;
  const patch: JsonRecord[] = [];
  const put: JsonRecord[] = [];
  const kept: string[] = [];
  const added: string[] = [];
  for (const [id, entry] of after) {
    const old = before.get(id);
    if (old === undefined) {
      put.push(entry);
      added.push(id);
      continue;
    }
    kept.push(id);
    if (Object.keys(old).some((key) => !(key in entry))) put.push(entry);
    else {
      const changed = Object.entries(entry).filter(([key, value]) => !same(old[key], value));
      if (changed.length > 0) patch.push({ id, ...Object.fromEntries(changed) });
    }
  }
  const drop = [...before.keys()].filter((id) => !after.has(id));
  const expected = [...before.keys()].filter((id) => after.has(id)).concat(added);
  const order = [...after.keys()];
  return {
    ...(patch.length > 0 && { patch }), ...(put.length > 0 && { put }), ...(drop.length > 0 && { drop }),
    ...(!same(expected, order) && { order }),
  };
}

/**
 * The change from one sequenced message's content to the next (both as JSON reads them), or null
 * when it cannot be told as a delta. Empty when nothing changed.
 */
export function deltaChanges(of: DeltaOf, previous: JsonRecord, next: JsonRecord): DeltaChanges | null {
  const lists: Record<string, ListDelta> = {};
  for (const field of DELTA_LISTS[of]) {
    const delta = listDelta(previous[field], next[field]);
    if (delta === null) return null;
    if (Object.keys(delta).length > 0) lists[field] = delta;
  }
  const plain = (key: string): boolean => !FRAMING.includes(key) && !DELTA_LISTS[of].includes(key);
  const set = Object.fromEntries(Object.entries(next).filter(([key, value]) => plain(key) && !same(previous[key], value)));
  const unset = Object.keys(previous).filter((key) => plain(key) && !(key in next));
  return { ...(Object.keys(lists).length > 0 && { lists }), ...(Object.keys(set).length > 0 && { set }), ...(unset.length > 0 && { unset }) };
}

/** A list with a delta applied, or null when the delta does not fit it. */
function applyList(list: unknown, delta: ListDelta): JsonRecord[] | null {
  const entries = byId(list);
  if (entries === null) return null;
  for (const id of delta.drop ?? []) if (!entries.delete(id)) return null;
  for (const patch of delta.patch ?? []) {
    const id = idOf(patch);
    const old = id === null ? undefined : entries.get(id);
    if (id === null || old === undefined) return null;
    entries.set(id, { ...old, ...patch });
  }
  for (const entry of delta.put ?? []) {
    const id = idOf(entry);
    if (id === null) return null;
    entries.set(id, entry);
  }
  if (delta.order === undefined) return [...entries.values()];
  if (delta.order.length !== entries.size || new Set(delta.order).size !== entries.size) return null;
  const ordered = delta.order.map((id) => entries.get(id));
  return ordered.every((entry) => entry !== undefined) ? ordered : null;
}

/** A sequenced message's content with a delta's changes applied, or null when they do not fit it. Not yet checked as a message. */
export function applyDelta(of: DeltaOf, content: JsonRecord, changes: DeltaChanges): JsonRecord | null {
  // A map, so that no field name (`__proto__`) is more than a field.
  const next = new Map(Object.entries(content));
  for (const [field, delta] of Object.entries(changes.lists ?? {})) {
    if (!DELTA_LISTS[of].includes(field)) return null;
    const list = applyList(content[field], delta);
    if (list === null) return null;
    next.set(field, list);
  }
  for (const [key, value] of Object.entries(changes.set ?? {})) next.set(key, value);
  for (const key of changes.unset ?? []) next.delete(key);
  return Object.fromEntries(next);
}

const isId = (value: unknown): value is string => typeof value === 'string' && TOKEN_ID_PATTERN.test(value);
const isIdList = (value: unknown): value is string[] => Array.isArray(value) && value.length <= MAX_DELTA_ENTRIES && value.every(isId);
const isEntryList = (value: unknown): value is JsonRecord[] => Array.isArray(value) && value.length <= MAX_DELTA_ENTRIES && value.every((entry) => isRecord(entry) && isId(entry.id));

function parseListDelta(value: unknown): ListDelta | null {
  if (!isRecord(value)) return null;
  const { patch, put, drop, order } = value;
  if ((patch !== undefined && !isEntryList(patch)) || (put !== undefined && !isEntryList(put))) return null;
  if ((drop !== undefined && !isIdList(drop)) || (order !== undefined && !isIdList(order))) return null;
  return { ...(patch && { patch }), ...(put && { put }), ...(drop && { drop }), ...(order && { order }) };
}

/** The sequence number a sequenced message carries: undefined when absent, null when malformed. */
export function parseSeq(value: unknown): number | undefined | null {
  if (value === undefined) return undefined;
  return Number.isSafeInteger(value) && (value as number) >= 0 ? (value as number) : null;
}

/**
 * A delta message's framing and changes, or null for anything malformed. What the changes make is
 * checked once applied, as the whole message it stands for.
 */
export function parseDelta(value: Record<string, unknown>): DeltaMessage | null {
  const { of, scene, lists, set, unset } = value;
  if (!isDeltaOf(of)) return null;
  const seq = parseSeq(value.seq);
  if (typeof scene !== 'string' || scene.length > MAX_SCENE_ID || seq === null || seq === undefined) return null;
  const plain = (key: string): boolean => !FRAMING.includes(key) && !DELTA_LISTS[of].includes(key);
  let parsed: Record<string, ListDelta> | undefined;
  if (lists !== undefined) {
    if (!isRecord(lists)) return null;
    parsed = {};
    for (const [field, delta] of Object.entries(lists)) {
      const list = DELTA_LISTS[of].includes(field) ? parseListDelta(delta) : null;
      if (list === null) return null;
      parsed[field] = list;
    }
  }
  if (set !== undefined && (!isRecord(set) || !Object.keys(set).every(plain))) return null;
  if (unset !== undefined && (!Array.isArray(unset) || unset.length > 16 || !unset.every((key) => typeof key === 'string' && plain(key)))) return null;
  return { t: 'delta', of, scene, seq, ...(parsed && { lists: parsed }), ...(set !== undefined && { set }), ...(unset !== undefined && { unset: unset as string[] }) };
}
