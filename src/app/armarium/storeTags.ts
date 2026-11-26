import { isRecord } from '../utils/guards';

/** A tag the Armarium's store offers, with the number of listings the store shows once it is picked. */
export interface StoreTag {
  id: string;
  label: string;
  count: number;
}

/** A group of the store's tags (Genre, Place, Format…), in the store's order. */
export interface StoreTagGroup {
  id: string;
  label: string;
  tags: StoreTag[];
}

/** What the store page says of its tags: the groups it offers and the tags its filter holds. */
export interface StoreTags {
  groups: StoreTagGroup[];
  /** Ids of the picked tags, each one of `groups`' tags. */
  picked: string[];
}

/** Bounds far above the store's list (52 tags in 6 groups): a message beyond them is no list the page sends. */
const MAX_GROUPS = 32;
const MAX_TAGS = 256;
const MAX_LABEL = 80;
const MAX_COUNT = 1_000_000;
/** The store's ids are kebab case (`dark-fantasy`). */
const ID = /^[a-z0-9][a-z0-9-]{0,63}$/;

const isId = (value: unknown): value is string => typeof value === 'string' && ID.test(value);

function readLabel(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const label = value.trim();
  return label.length > 0 && label.length <= MAX_LABEL ? label : null;
}

function readTag(value: unknown): StoreTag | null {
  if (!isRecord(value) || !isId(value.id)) return null;
  const label = readLabel(value.label);
  const count = value.count;
  if (label === null || typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0 || count > MAX_COUNT) return null;
  return { id: value.id, label, count };
}

function readGroup(value: unknown): StoreTagGroup | null {
  if (!isRecord(value) || !isId(value.id) || !Array.isArray(value.tags)) return null;
  const label = readLabel(value.label);
  const tags = value.tags.map(readTag);
  if (label === null || tags.some((tag) => tag === null)) return null;
  return { id: value.id, label, tags: tags as StoreTag[] };
}

/**
 * The store's tags in a message from its page, or null where any part does not read: a group, a tag, an id that is no
 * kebab-case id, a label empty or too long, a count that is no whole number, more groups or tags than any store has,
 * a tag named twice, or a picked id that is none of the tags.
 */
export function readStoreTags(data: Record<string, unknown>): StoreTags | null {
  const { groups, picked } = data;
  if (!Array.isArray(groups) || groups.length > MAX_GROUPS || !Array.isArray(picked)) return null;
  const read = groups.map(readGroup);
  if (read.some((group) => group === null)) return null;
  const valid = read as StoreTagGroup[];
  const ids = valid.flatMap((group) => group.tags.map((tag) => tag.id));
  if (ids.length > MAX_TAGS || new Set(ids).size !== ids.length) return null;
  if (picked.length > ids.length || !picked.every((id) => isId(id) && ids.includes(id))) return null;
  return { groups: valid, picked: [...new Set(picked as string[])] };
}
