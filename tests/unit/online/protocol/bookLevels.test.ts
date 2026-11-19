import { describe, expect, it } from 'vitest';
import { MAX_BOOK_MAPS, MAX_MAP_ENTRANCES, MAX_MAP_SIGNS, parseGmMessage, parsePlayerMessage, type BookWorldMap, type PlayerBook } from '../../../../src/app/online/protocol/index.ts';

const ART = { hash: 'a'.repeat(64), size: 10, mime: 'image/webp', id: 'e'.repeat(64) };
const WORLD = '0'.repeat(24);
const TOWN = '1'.repeat(24);
const INN = '2'.repeat(24);
const PIN = '3'.repeat(24);
const MAP: BookWorldMap = {
  image: ART,
  width: 4000,
  height: 3000,
  id: WORLD,
  entrances: [{ x: 0.5, y: 0.25, to: TOWN, title: 'Lowmoor' }],
  maps: [
    { id: TOWN, title: 'Lowmoor', image: ART, width: 800, height: 600, entrances: [{ x: 0.1, y: 0.2, to: INN, title: 'The Inn' }, { x: 0, y: 1, to: WORLD, title: 'The Wide World' }] },
    { id: INN, title: 'The Inn', image: ART, width: 100, height: 100, entrances: [] },
  ],
};
const book = (worldMap: unknown): Record<string, unknown> => ({ character: null, worldMap, items: [], notes: [], pins: [], quests: [], purse: [] });
const worldMapOf = (worldMap: unknown): BookWorldMap | null | undefined => {
  const read = parseGmMessage({ t: 'book', book: book(worldMap) });
  return read?.t === 'book' ? (read.book as PlayerBook).worldMap : undefined;
};

describe('the maps a world map leads into', () => {
  it('are read with their entrances, and a world map of an older GM has none', () => {
    expect(worldMapOf(MAP)).toEqual(MAP);
    expect(worldMapOf({ image: ART, width: 4000, height: 3000 })).toEqual({ image: ART, width: 4000, height: 3000 });
  });

  it('lose an entrance to a map that is not there, one that cannot be read, and a map that cannot be read', () => {
    const read = worldMapOf({
      ...MAP,
      entrances: [...MAP.entrances!, { x: 0.3, y: 0.3, to: '9'.repeat(24), title: 'Nowhere' }, { x: 2, y: 0, to: TOWN, title: 'Off' }, { x: 0.1, y: 0.1, to: WORLD, title: 'Itself' }],
      maps: [...MAP.maps!, { id: 'not an id', title: 'Bad', image: ART, width: 1, height: 1 }, { ...MAP.maps![1], title: 'Twice' }],
    });
    expect(read).toEqual(MAP);
  });

  it('are refused as a whole when there are more than a book holds', () => {
    const many = Array.from({ length: MAX_BOOK_MAPS + 1 }, (_, index) => ({ ...MAP.maps![1], id: index.toString(16).padStart(24, '0') }));
    expect(worldMapOf({ ...MAP, maps: many })).toBeUndefined();
    const crowded = Array.from({ length: MAX_MAP_ENTRANCES + 1 }, () => MAP.entrances![0]);
    expect(worldMapOf({ ...MAP, entrances: crowded })).toBeUndefined();
  });

  it('hold a player\'s pins, each on its own map', () => {
    const pin = { id: PIN, map: TOWN, x: 0.5, y: 0.5, kind: 'note', title: 'Well', body: '' };
    expect(parsePlayerMessage({ t: 'book-pin', pin })).toEqual({ t: 'book-pin', pin });
    const { map: _onTheWorldMap, ...worldPin } = pin;
    expect(parsePlayerMessage({ t: 'book-pin', pin: worldPin })).toEqual({ t: 'book-pin', pin: worldPin });
    expect(parsePlayerMessage({ t: 'book-pin', pin: { ...pin, map: 'town' } })).toBeNull();
  });

  it('hold the GM\'s readable pins as signs on each map, which an older page reads as no part of it', () => {
    const sign = { id: '4'.repeat(24), x: 0.2, y: 0.4, icon: 'number', label: '7', found: null };
    const found = { id: '5'.repeat(24), x: 0.6, y: 0.1, icon: 'pin', found: '6'.repeat(24) };
    const signed: BookWorldMap = { ...MAP, signs: [sign], maps: [{ ...MAP.maps![0]!, signs: [found] }, MAP.maps![1]!] };
    expect(worldMapOf(signed)).toEqual(signed);
    // A sign that cannot be read is left out, one named twice is kept once; a list longer than a map holds refuses the map.
    expect(worldMapOf({ ...MAP, signs: [sign, sign, { ...found, x: 2 }, { ...found, id: 'Places/Keep.md' }, { ...found, found: 'entry' }] })).toEqual({ ...MAP, signs: [sign] });
    expect(worldMapOf({ ...MAP, signs: Array.from({ length: MAX_MAP_SIGNS + 1 }, () => sign) })).toBeUndefined();
    // Signs say nothing of the note: anything else a sign carries is not read.
    expect(worldMapOf({ ...MAP, signs: [{ ...sign, note: 'Places/Keep.md' }] })).toEqual({ ...MAP, signs: [sign] });
  });

  it('are opened by alias, as a readable pin of the table is', () => {
    expect(parsePlayerMessage({ t: 'sign-found', sign: PIN })).toEqual({ t: 'sign-found', sign: PIN });
    expect(parsePlayerMessage({ t: 'sign-found', sign: 'Places/Keep.md' })).toBeNull();
    expect(parsePlayerMessage({ t: 'sign-found' })).toBeNull();
  });
});
