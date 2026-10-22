import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SLOTS, fitsPlayerFrame, MAX_OWN_SLOTS, MAX_SLOT_NAME, mayEquip, parseGmMessage, parsePlayerMessage, settledEquipped, shownSlots, withEquipped, type BookSlots, type PlayerBookMessage,
} from '../../../../src/app/online/protocol/index.ts';

const id = (count: number): string => count.toString(16).padStart(24, '0');
const ROPE = id(1);
const SWORD = id(2);
const BAG = id(9);
const SLOTS: BookSlots = { hidden: ['ammunition', 'ring-2'], own: [{ id: BAG, name: 'Saddlebag' }] };

describe('a book\'s slots', () => {
  it('show the defaults in body order without the hidden ones, then the player\'s own', () => {
    expect(shownSlots({ hidden: [], own: [] }).map(({ name }) => name)).toEqual(['Main hand', 'Off hand', 'Ammunition', 'Armour', 'Head', 'Neck', 'Cloak', 'Body', 'Hands', 'Belt', 'Feet', 'Ring I', 'Ring II']);
    const shown = shownSlots(SLOTS);
    expect(shown.map(({ id: slot }) => slot)).toEqual([...DEFAULT_SLOTS.filter((slot) => slot !== 'ammunition' && slot !== 'ring-2'), BAG]);
    expect(shown.at(-1)).toEqual({ id: BAG, name: 'Saddlebag', own: true });
  });

  it('hold one item a slot and a slot an item: what lay there goes back to the bag, and an item moves', () => {
    let equipped = withEquipped([], ROPE, 'belt');
    equipped = withEquipped(equipped, SWORD, 'belt');
    expect(equipped).toEqual([{ slot: 'belt', item: SWORD }]);
    equipped = withEquipped(equipped, SWORD, 'main-hand');
    expect(equipped).toEqual([{ slot: 'main-hand', item: SWORD }]);
    expect(withEquipped(equipped, SWORD, null)).toEqual([]);
  });

  it('take any item the book holds into any slot it shows, and nothing else', () => {
    const book = { slots: SLOTS, items: [{ id: ROPE }] };
    expect(mayEquip(book, ROPE, 'head')).toBe(true);
    expect(mayEquip(book, ROPE, BAG)).toBe(true);
    expect(mayEquip(book, ROPE, null)).toBe(true);
    expect(mayEquip(book, ROPE, 'ammunition')).toBe(false);
    expect(mayEquip(book, ROPE, id(7))).toBe(false);
    expect(mayEquip(book, SWORD, 'head')).toBe(false);
  });

  it('send an item back to the bag once its slot is hidden or removed, or the item is gone', () => {
    const equipped = [{ slot: 'head', item: ROPE }, { slot: BAG, item: SWORD }];
    expect(settledEquipped(equipped, { hidden: ['head'], own: [] }, [{ id: ROPE }, { id: SWORD }])).toEqual([]);
    expect(settledEquipped(equipped, SLOTS, [{ id: ROPE }])).toEqual([{ slot: 'head', item: ROPE }]);
    expect(settledEquipped(equipped, SLOTS, [{ id: ROPE }, { id: SWORD }])).toBe(equipped);
  });

  it('read what a book sends as it is kept: an item equipped into a hidden slot is back in the bag', () => {
    const item = { id: ROPE, name: 'Rope', type: null, rarity: null, tone: null, price: null, description: null, properties: [], at: 1 };
    const book = { character: null, worldMap: null, items: [item], notes: [], pins: [], purse: [], slots: SLOTS, equipped: [{ slot: 'ammunition', item: ROPE }] };
    expect(parseGmMessage({ t: 'book', book })).toEqual({ t: 'book', book: { ...book, quests: [], equipped: [] } });
  });
});

describe('what a player changes about their slots', () => {
  it('reads an item put into a slot or taken out, and the slots whole, cleaned', () => {
    expect(parsePlayerMessage({ t: 'book-equip', item: ROPE, slot: 'head' })).toEqual({ t: 'book-equip', item: ROPE, slot: 'head' });
    expect(parsePlayerMessage({ t: 'book-equip', item: ROPE, slot: BAG })).toEqual({ t: 'book-equip', item: ROPE, slot: BAG });
    expect(parsePlayerMessage({ t: 'book-equip', item: ROPE, slot: null })).toEqual({ t: 'book-equip', item: ROPE, slot: null });
    const sent = { t: 'book-slots', slots: { hidden: ['feet'], own: [{ id: BAG, name: '  Saddle​bag ' }] } };
    expect(parsePlayerMessage(sent)).toEqual({ t: 'book-slots', slots: { hidden: ['feet'], own: [{ id: BAG, name: 'Saddlebag' }] } });
  });

  it('refuses what is malformed, twice there or more than a book holds', () => {
    const own = (count: number): { id: string; name: string }[] => Array.from({ length: count }, (_, at) => ({ id: id(at + 20), name: `Slot ${at}` }));
    const broken: Record<string, unknown>[] = [
      { t: 'book-equip', item: 'rope', slot: 'head' },
      { t: 'book-equip', item: ROPE, slot: 'tail' },
      { t: 'book-equip', item: ROPE },
      { t: 'book-slots', slots: { hidden: ['head', 'head'], own: [] } },
      { t: 'book-slots', slots: { hidden: ['tail'], own: [] } },
      { t: 'book-slots', slots: { hidden: [], own: own(MAX_OWN_SLOTS + 1) } },
      { t: 'book-slots', slots: { hidden: [], own: [{ id: BAG, name: 'x'.repeat(MAX_SLOT_NAME + 1) }] } },
      { t: 'book-slots', slots: { hidden: [], own: [{ id: BAG, name: ' ' }] } },
      { t: 'book-slots', slots: { hidden: [], own: [{ id: BAG, name: 'A' }, { id: BAG, name: 'B' }] } },
      { t: 'book-slots', slots: { hidden: [] } },
    ];
    for (const message of broken) expect(parsePlayerMessage(message), JSON.stringify(message).slice(0, 120)).toBeNull();
  });

  it('fits the fullest slot list into one player frame', () => {
    const slots: BookSlots = { hidden: [...DEFAULT_SLOTS], own: Array.from({ length: MAX_OWN_SLOTS }, (_, at) => ({ id: id(at + 30), name: '\u{1D504}'.repeat(MAX_SLOT_NAME) })) };
    const message: PlayerBookMessage = { t: 'book-slots', slots };
    expect(parsePlayerMessage(JSON.parse(JSON.stringify(message)))).toEqual(message);
    expect(fitsPlayerFrame(message)).toBe(true);
  });
});
