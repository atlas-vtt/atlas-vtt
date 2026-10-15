// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  bookLine, bookText, fitsPlayerFrame, isQuestDone, MAX_BOOK_NOTES, MAX_RESOURCE_KEY, MAX_TOKEN_VALUE, MAX_BOOK_QUESTS, MAX_NOTE_BODY, MAX_QUEST_REWARDS, parseGmMessage, parsePlayerMessage, type BookItem, type BookQuest, type PlayerBook,
} from '../../../../src/app/online/protocol/index.ts';

const HASH = 'a'.repeat(64);
const ID = '0123456789abcdef01234567';
const ART = { hash: HASH, size: 10, mime: 'image/webp' };
const ITEM: BookItem = { id: ID, name: 'Rope', type: 'Gear', rarity: 'Common', tone: 'common', price: '1 gold', description: 'Fifty feet.\nHemp.', properties: [{ label: 'Weight', value: '5' }], at: 12 };
const QUEST_ID = 'fedcba9876543210fedcba98';
const QUEST: BookQuest = { id: QUEST_ID, kind: 'main', state: 'active', title: 'The crown under the root', body: 'The Horned King wants it back.', place: { x: 0.25, y: 0.5 }, xp: 1200, rewards: ['Favour of the King'] };
const BOOK: PlayerBook = {
  character: { name: 'Ana', art: ART, ring: '#ffffff', resources: [{ key: 'hp', name: 'HP', colour: '#aa0000', direction: 'drains', current: 3, max: 8, editable: true }] },
  worldMap: { image: ART, width: 4000, height: 3000 },
  items: [ITEM],
  notes: [{ id: ID, title: 'Lead', body: 'Ask the miller.', at: 5 }],
  pins: [{ id: ID, x: 0.5, y: 1, kind: 'danger', title: 'Bog', body: '' }],
  quests: [QUEST],
  purse: [{ name: 'gold', amount: 12 }],
  slots: { hidden: ['ammunition'], own: [{ id: ID, name: 'Saddlebag' }] },
  equipped: [{ slot: ID, item: ID }],
};

describe('book messages to a player', () => {
  it('read a whole book, a sheet alone and an item', () => {
    expect(parseGmMessage({ t: 'book', book: BOOK })).toEqual({ t: 'book', book: BOOK });
    expect(parseGmMessage({ t: 'book-sheet', character: null })).toEqual({ t: 'book-sheet', character: null });
    expect(parseGmMessage({ t: 'book-item', item: ITEM })).toEqual({ t: 'book-item', item: ITEM });
  });

  it('read the world map or the quests alone, as a page that reads parts is sent them, and nothing malformed', () => {
    expect(parseGmMessage({ t: 'book-map', worldMap: BOOK.worldMap })).toEqual({ t: 'book-map', worldMap: BOOK.worldMap });
    expect(parseGmMessage({ t: 'book-map', worldMap: null })).toEqual({ t: 'book-map', worldMap: null });
    expect(parseGmMessage({ t: 'book-quests', quests: [QUEST, { id: 'nope' }] })).toEqual({ t: 'book-quests', quests: [QUEST] });
    expect(parseGmMessage({ t: 'book-quests', quests: [] })).toEqual({ t: 'book-quests', quests: [] });
    for (const broken of [{ t: 'book-map' }, { t: 'book-map', worldMap: { width: 0, height: 1, image: ART } }, { t: 'book-quests' }, { t: 'book-quests', quests: {} }, { t: 'book-quests', quests: Array.from({ length: MAX_BOOK_QUESTS + 1 }, () => QUEST) }]) {
      expect(parseGmMessage(broken), JSON.stringify(broken).slice(0, 80)).toBeNull();
    }
    expect(parsePlayerMessage({ t: 'book-parts' })).toEqual({ t: 'book-parts' });
  });

  it('read a book without character, map or entries', () => {
    const empty = { character: null, worldMap: null, items: [], notes: [], pins: [], quests: [], purse: [], slots: { hidden: [], own: [] }, equipped: [] };
    expect(parseGmMessage({ t: 'book', book: empty })).toEqual({ t: 'book', book: empty });
  });

  it('read a book of a GM that knows no slots as the default slots with nothing equipped', () => {
    const older: Record<string, unknown> = { ...BOOK };
    delete older.slots;
    delete older.equipped;
    expect(parseGmMessage({ t: 'book', book: older })).toEqual({ t: 'book', book: { ...BOOK, slots: { hidden: [], own: [] }, equipped: [] } });
  });

  it('read a book of a GM that gives no quests as one without, and pins of the older kinds as the kinds that took their place', () => {
    const older: Record<string, unknown> = { ...BOOK, pins: [{ ...BOOK.pins[0], kind: 'place' }] };
    delete older.quests;
    expect(parseGmMessage({ t: 'book', book: older })).toEqual({ t: 'book', book: { ...BOOK, pins: [{ ...BOOK.pins[0], kind: 'dungeon' }], quests: [] } });
  });

  it('read the resources of an older GM\'s sheet, which names no key and no edits, as ones the player cannot change, and never a fixed or unnamed one as changeable', () => {
    const resource = { name: 'HP', colour: '#aa0000', direction: 'drains', current: 3, max: 8 };
    const read = (resources: unknown[]): unknown => parseGmMessage({ t: 'book-sheet', character: { ...BOOK.character, resources } });
    expect(read([resource])).toMatchObject({ character: { resources: [{ ...resource, key: null, editable: false }] } });
    expect(read([{ ...resource, key: null, editable: true }])).toMatchObject({ character: { resources: [{ key: null, editable: false }] } });
    expect(read([{ ...resource, direction: 'static', key: 'ac', editable: true }])).toMatchObject({ character: { resources: [{ key: 'ac', editable: false }] } });
    expect(read([{ ...resource, key: 'k'.repeat(MAX_RESOURCE_KEY), editable: true }])).toMatchObject({ character: { resources: [{ editable: true }] } });
    for (const broken of [{ key: '' }, { key: 'k'.repeat(MAX_RESOURCE_KEY + 1) }, { key: 'h\u0000p' }, { key: 7 }, { key: 'hp', editable: 'yes' }]) {
      expect(read([{ ...resource, ...broken }]), JSON.stringify(broken)).toBeNull();
    }
  });

  it('read a quest that names no place, experience or rewards as one without them', () => {
    const bare = { id: QUEST_ID, kind: 'side', state: 'open', title: 'The goat of Lankshorn' };
    expect(parseGmMessage({ t: 'book', book: { ...BOOK, quests: [bare] } })).toEqual({ t: 'book', book: { ...BOOK, quests: [{ ...bare, body: '', place: null, xp: 0, rewards: [] }] } });
    expect(isQuestDone(QUEST)).toBe(false);
    expect(isQuestDone({ state: 'failed' })).toBe(true);
  });

  it('leave out a malformed quest and show the rest of the book', () => {
    const broken: unknown[] = [
      { ...QUEST, kind: 'urgent' },
      { ...QUEST, state: 'heard' },
      { ...QUEST, title: '' },
      { ...QUEST, place: { x: 2, y: 0 } },
      { ...QUEST, xp: -1 },
      { ...QUEST, xp: 1.5 },
      { ...QUEST, rewards: Array.from({ length: MAX_QUEST_REWARDS + 1 }, () => 'Gold') },
      { ...QUEST, rewards: [''] },
    ];
    const other = { ...QUEST, id: '0'.repeat(24), title: 'The goat of Lankshorn' };
    for (const quest of broken) expect(parseGmMessage({ t: 'book', book: { ...BOOK, quests: [quest, other] } }), JSON.stringify(quest)).toEqual({ t: 'book', book: { ...BOOK, quests: [other] } });
    expect(parseGmMessage({ t: 'book', book: { ...BOOK, quests: [QUEST, { ...QUEST, title: 'Again' }] } })).toEqual({ t: 'book', book: BOOK });
    expect(parseGmMessage({ t: 'book', book: { ...BOOK, quests: QUEST } })).toBeNull();
    expect(parseGmMessage({ t: 'book', book: { ...BOOK, quests: Array.from({ length: MAX_BOOK_QUESTS + 1 }, (_, n) => ({ ...QUEST, id: n.toString(16).padStart(24, '0') })) } })).toBeNull();
  });

  it('refuse malformed books', () => {
    const broken: unknown[] = [
      { ...BOOK, items: [{ ...ITEM, id: 'x' }] },
      { ...BOOK, items: [ITEM, ITEM] },
      { ...BOOK, items: [{ ...ITEM, tone: 'shiny' }] },
      { ...BOOK, character: { ...BOOK.character, ring: 'red' } },
      { ...BOOK, character: { ...BOOK.character, art: { hash: HASH, size: 1, mime: 'text/html' } } },
      { ...BOOK, character: { ...BOOK.character, resources: [{ name: 'HP', colour: '#aa0000', direction: 'drains', current: 1, max: 0 }] } },
      { ...BOOK, worldMap: { image: ART, width: 0, height: 10 } },
      { ...BOOK, pins: [{ ...BOOK.pins[0], x: 1.2 }] },
      { ...BOOK, pins: [{ ...BOOK.pins[0], kind: 'quest' }] },
      { ...BOOK, purse: [{ name: 'gold', amount: -1 }] },
      { ...BOOK, notes: Array.from({ length: MAX_BOOK_NOTES + 1 }, () => BOOK.notes[0]) },
      { ...BOOK, slots: { hidden: ['tail'], own: [] } },
      { ...BOOK, slots: null },
      { ...BOOK, equipped: [{ slot: 'head', item: 'rope' }] },
    ];
    for (const book of broken) expect(parseGmMessage({ t: 'book', book }), JSON.stringify(book).slice(0, 120)).toBeNull();
  });
});

describe('what a player writes into their book', () => {
  it('reads notes, pins, the purse and deletions, cleaned', () => {
    expect(parsePlayerMessage({ t: 'book-note', note: { id: ID, title: '  A‮ title ', body: 'one\r\n\r\n\r\n\r\ntwo  \n' } })).toEqual({ t: 'book-note', note: { id: ID, title: 'A title', body: 'one\n\ntwo' } });
    expect(parsePlayerMessage({ t: 'book-note', note: { id: ID, title: '', body: '' } })).toEqual({ t: 'book-note', note: { id: ID, title: '', body: '' } });
    expect(parsePlayerMessage({ t: 'book-pin', pin: BOOK.pins[0] })).toEqual({ t: 'book-pin', pin: BOOK.pins[0] });
    expect(parsePlayerMessage({ t: 'book-note-delete', id: ID })).toEqual({ t: 'book-note-delete', id: ID });
    expect(parsePlayerMessage({ t: 'book-pin-delete', id: ID })).toEqual({ t: 'book-pin-delete', id: ID });
    expect(parsePlayerMessage({ t: 'book-note', note: { id: ID, title: '', body: 'He lies.', quest: QUEST_ID } })).toEqual({ t: 'book-note', note: { id: ID, title: '', body: 'He lies.', quest: QUEST_ID } });
    expect(parsePlayerMessage({ t: 'book-note', note: { id: ID, title: '', body: '', quest: null } })).toEqual({ t: 'book-note', note: { id: ID, title: '', body: '' } });
    expect(parsePlayerMessage({ t: 'book-pin', pin: { ...BOOK.pins[0], kind: 'place' } })).toEqual({ t: 'book-pin', pin: { ...BOOK.pins[0], kind: 'dungeon' } });
    expect(parsePlayerMessage({ t: 'book-purse', purse: BOOK.purse })).toEqual({ t: 'book-purse', purse: BOOK.purse });
    expect(parsePlayerMessage({ t: 'book-resource', key: 'hp', current: 5, extra: true })).toEqual({ t: 'book-resource', key: 'hp', current: 5 });
    expect(parsePlayerMessage({ t: 'book-resource', key: 'hp', current: -MAX_TOKEN_VALUE })).toEqual({ t: 'book-resource', key: 'hp', current: -MAX_TOKEN_VALUE });
  });

  it('refuses an edit of a resource that names no key, or no finite value within the limits', () => {
    for (const broken of [{ key: '', current: 1 }, { key: 'k'.repeat(MAX_RESOURCE_KEY + 1), current: 1 }, { key: 'hp', current: Number.NaN }, { key: 'hp', current: Number.POSITIVE_INFINITY }, { key: 'hp', current: MAX_TOKEN_VALUE + 1 }, { key: 'hp', current: '5' }, { current: 5 }]) {
      expect(parsePlayerMessage({ t: 'book-resource', ...broken }), JSON.stringify(broken)).toBeNull();
    }
    expect(parseGmMessage({ t: 'book-resource', key: 'hp', current: 1 })).toBeNull();
    expect(fitsPlayerFrame({ t: 'book-resource', key: 'k'.repeat(MAX_RESOURCE_KEY), current: -MAX_TOKEN_VALUE })).toBe(true);
  });

  it('refuses what is malformed or too long, and never takes a GM kind from a player', () => {
    expect(parsePlayerMessage({ t: 'book-note', note: { id: ID, title: 't', body: 'x'.repeat(MAX_NOTE_BODY + 1) } })).toBeNull();
    expect(parsePlayerMessage({ t: 'book-note', note: { id: ID, title: 'x'.repeat(81), body: '' } })).toBeNull();
    expect(parsePlayerMessage({ t: 'book-note-delete', id: '../x' })).toBeNull();
    expect(parsePlayerMessage({ t: 'book-pin', pin: { ...BOOK.pins[0], y: Number.NaN } })).toBeNull();
    expect(parsePlayerMessage({ t: 'book-pin', pin: { ...BOOK.pins[0], kind: 'quest' } })).toBeNull();
    expect(parsePlayerMessage({ t: 'book-note', note: { id: ID, title: '', body: '', quest: 'a quest' } })).toBeNull();
    expect(parsePlayerMessage({ t: 'book-quest', quest: QUEST })).toBeNull();
    expect(parsePlayerMessage({ t: 'book-purse', purse: [{ name: 'gold', amount: 1.5 }] })).toBeNull();
    expect(parsePlayerMessage({ t: 'book-item', item: ITEM })).toBeNull();
    expect(parsePlayerMessage({ t: 'book', book: BOOK })).toBeNull();
    expect(parseGmMessage({ t: 'book-note', note: { id: ID, title: '', body: '' } })).toBeNull();
  });
});

describe('book texts', () => {
  it('keep indents and single blank lines, and drop marks that do not show', () => {
    expect(bookText('- a\n  - b​\n\n\n\nc', 100)).toBe('- a\n  - b\n\nc');
    expect(bookLine('​', 10)).toBeNull();
    expect(bookLine('', 10, true)).toBe('');
  });

  it('say whether a note fits one player frame', () => {
    expect(fitsPlayerFrame({ t: 'book-note', note: { id: ID, title: 't', body: 'x'.repeat(MAX_NOTE_BODY) } })).toBe(true);
    expect(fitsPlayerFrame({ t: 'book-note', note: { id: ID, title: 't', body: '語'.repeat(MAX_NOTE_BODY) } })).toBe(false);
  });
});
