import { bookLine } from './bookText.ts';
import { isRecord } from './shape.ts';

/**
 * The slots every book starts with, in the order a body is read: the hands first, since they count
 * in a fight, then from the head down. Any item may go into any slot; the player decides what fits.
 */
export const DEFAULT_SLOTS = ['main-hand', 'off-hand', 'ammunition', 'armour', 'head', 'neck', 'cloak', 'body', 'hands', 'belt', 'feet', 'ring-1', 'ring-2'] as const;
export type DefaultSlot = (typeof DEFAULT_SLOTS)[number];

export const DEFAULT_SLOT_NAMES: Readonly<Record<DefaultSlot, string>> = {
  'main-hand': 'Main hand',
  'off-hand': 'Off hand',
  ammunition: 'Ammunition',
  armour: 'Armour',
  head: 'Head',
  neck: 'Neck',
  cloak: 'Cloak',
  body: 'Body',
  hands: 'Hands',
  belt: 'Belt',
  feet: 'Feet',
  'ring-1': 'Ring I',
  'ring-2': 'Ring II',
};

/** How many slots of their own a player may add, and the longest name of one, in characters. */
export const MAX_OWN_SLOTS = 12;
export const MAX_SLOT_NAME = 24;
/** An own slot's id: 96 random bits in hex, made by the player's page, like an item's or a note's. */
export const SLOT_ID_PATTERN = /^[0-9a-f]{24}$/;
const isHexId = (value: unknown): value is string => typeof value === 'string' && SLOT_ID_PATTERN.test(value);

/** A slot the player added and named. */
export interface OwnSlot {
  readonly id: string;
  readonly name: string;
}

/** The player's slots: the default ones they hid, and their own in the order they added them. */
export interface BookSlots {
  readonly hidden: readonly DefaultSlot[];
  readonly own: readonly OwnSlot[];
}

/** An item in a slot, both by id. A slot holds one item, and an item lies in one slot at most. */
export interface Equipped {
  readonly slot: string;
  readonly item: string;
}

/** The slots of a book nobody has changed, and of a book from a GM that knows no slots. */
export const DEFAULT_BOOK_SLOTS: BookSlots = { hidden: [], own: [] };

/** A slot as a list shows it: its id, its name, and whether it is one of the defaults. */
export interface ShownSlot {
  readonly id: string;
  readonly name: string;
  readonly own: boolean;
}

/** What a player changes about their slots: an item put into one or taken out (`slot` null), or the slots themselves. */
export type SlotMessage =
  | { readonly t: 'book-equip'; readonly item: string; readonly slot: string | null }
  | { readonly t: 'book-slots'; readonly slots: BookSlots };

const isDefaultSlot = (value: unknown): value is DefaultSlot => (DEFAULT_SLOTS as readonly unknown[]).includes(value);
const isSlotId = (value: unknown): value is string => isDefaultSlot(value) || isHexId(value);

/** The slots shown, in order: the defaults not hidden, then the player's own. */
export function shownSlots(slots: BookSlots): ShownSlot[] {
  const hidden = new Set<string>(slots.hidden);
  return [
    ...DEFAULT_SLOTS.filter((slot) => !hidden.has(slot)).map((slot) => ({ id: slot, name: DEFAULT_SLOT_NAMES[slot], own: false })),
    ...slots.own.map(({ id, name }) => ({ id, name, own: true })),
  ];
}

function parseOwnSlot(value: unknown): OwnSlot | null {
  if (!isRecord(value) || !isHexId(value.id)) return null;
  const name = bookLine(value.name, MAX_SLOT_NAME);
  return name === null ? null : { id: value.id, name };
}

/** A player's slots, or null for anything malformed: hidden defaults and own slots each once, no more of them than a book holds. */
export function parseBookSlots(value: unknown): BookSlots | null {
  if (!isRecord(value) || !Array.isArray(value.hidden) || !Array.isArray(value.own)) return null;
  if (value.hidden.length > DEFAULT_SLOTS.length || value.own.length > MAX_OWN_SLOTS || !value.hidden.every(isDefaultSlot)) return null;
  const own: OwnSlot[] = [];
  for (const entry of value.own as unknown[]) {
    const slot = parseOwnSlot(entry);
    if (slot === null) return null;
    own.push(slot);
  }
  const { hidden } = value;
  if (new Set(hidden).size !== hidden.length || new Set(own.map(({ id }) => id)).size !== own.length) return null;
  return { hidden, own };
}

/** What is equipped where, or null for anything malformed: each slot and each item once. */
export function parseEquipped(value: unknown): Equipped[] | null {
  if (!Array.isArray(value) || value.length > DEFAULT_SLOTS.length + MAX_OWN_SLOTS) return null;
  const equipped: Equipped[] = [];
  for (const entry of value as unknown[]) {
    if (!isRecord(entry) || !isSlotId(entry.slot) || !isHexId(entry.item)) return null;
    equipped.push({ slot: entry.slot, item: entry.item });
  }
  const unique = new Set(equipped.map(({ slot }) => slot)).size === equipped.length && new Set(equipped.map(({ item }) => item)).size === equipped.length;
  return unique ? equipped : null;
}

/** What is equipped, kept only where the slot is shown and the item is in the book: an item whose slot went is back in the bag. */
export function settledEquipped(equipped: readonly Equipped[], slots: BookSlots, items: readonly { readonly id: string }[]): readonly Equipped[] {
  const shown = new Set(shownSlots(slots).map(({ id }) => id));
  const held = new Set(items.map(({ id }) => id));
  const kept = equipped.filter(({ slot, item }) => shown.has(slot) && held.has(item));
  return kept.length === equipped.length ? equipped : kept;
}

/** A book without the item of `id`, which leaves the slot it lay in; null where the book does not hold it. */
export function withoutItem<B extends { readonly items: readonly { readonly id: string }[]; readonly equipped: readonly Equipped[] }>(book: B, id: string): B | null {
  if (!book.items.some((item) => item.id === id)) return null;
  return { ...book, items: book.items.filter((item) => item.id !== id), equipped: book.equipped.filter((entry) => entry.item !== id) };
}

/**
 * What is equipped once `item` is put into `slot`, or taken out where `slot` is null: it leaves the
 * slot it was in, and what lay in `slot` goes back to the bag. Checking that both exist is the caller's.
 */
export function withEquipped(equipped: readonly Equipped[], item: string, slot: string | null): readonly Equipped[] {
  const rest = equipped.filter((entry) => entry.item !== item && entry.slot !== slot);
  return slot === null ? rest : [...rest, { slot, item }];
}

/** Whether a book takes this change: the item is one it holds, and the slot one it shows (or none, to take the item out). */
export function mayEquip(book: { readonly slots: BookSlots; readonly items: readonly { readonly id: string }[] }, item: string, slot: string | null): boolean {
  if (!book.items.some(({ id }) => id === item)) return false;
  return slot === null || shownSlots(book.slots).some(({ id }) => id === slot);
}

/** A player's change of their slots as the GM reads it, cleaned; null for anything malformed. */
export function parseSlotMessage(value: Record<string, unknown>): SlotMessage | null {
  if (value.t === 'book-equip') {
    const slot = value.slot === null ? null : isSlotId(value.slot) ? value.slot : undefined;
    return slot === undefined || !isHexId(value.item) ? null : { t: 'book-equip', item: value.item, slot };
  }
  if (value.t !== 'book-slots') return null;
  const slots = parseBookSlots(value.slots);
  return slots === null ? null : { t: 'book-slots', slots };
}
