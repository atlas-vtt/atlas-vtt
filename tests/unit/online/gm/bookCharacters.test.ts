// @vitest-environment node
import type { BookCharacter } from '../../../../src/app/online/protocol/index.ts';
import { describe, expect, it } from 'vitest';
import type { ShownRollToken } from '../../../../src/app/services/playerRollSource';
import type { TokenEntity } from '../../../../src/app/types';
import type { BookScene } from '../../../../src/app/online/gm/book/bookScene.ts';
import { bookSceneOf } from '../../../../src/app/online/gm/book/bookScene.ts';
import { Characters } from '../../../../src/app/online/gm/book/characters.ts';
import { sheetOf } from '../../../../src/app/online/gm/book/bookSheet.ts';
import { DAGGERHEART } from '../../../../src/app/gameSystems/presets/daggerheart';
import { fakeTokenSource } from './fakeTokenSource.ts';
import { sceneState, token } from './shareHarness.ts';

const ANA = 'ana';
const BEN = 'ben';

interface Table {
  readonly owners: Map<string, string>;
  readonly known: Set<string>;
  /** The statblock notes of library tokens, by asset id or artwork. */
  readonly library: Map<string, string>;
  readonly characters: Characters;
  /** Reads a scene of these tokens, in this order; the ones in `unseen` are not in the players' frame. */
  read(tokens: readonly TokenEntity[], unseen?: readonly string[], collection?: string): void;
  /** Who plays what: the character's key and the name on its sheet. */
  played(player: string): string | null;
}

function table(owners: Readonly<Record<string, string>>): Table {
  const characters = new Characters();
  const held: Table = {
    owners: new Map(Object.entries(owners)),
    known: new Set([ANA, BEN]),
    library: new Map(),
    characters,
    read: (tokens, unseen = [], collection = 'Cairn') => {
      const scene: BookScene = {
        mapPath: 'map', collection, resources: [], tokens: Object.fromEntries(tokens.map((entry) => [entry.id, entry])),
        shown: (ids) => new Map(tokens.filter((entry) => ids.includes(entry.id) && !unseen.includes(entry.id)).map((entry): [string, ShownRollToken] => [entry.id, { name: entry.id, imagePath: entry.imagePath, showRing: true, ringColor: undefined }])),
        listedToken: () => undefined,
      };
      characters.update(scene, {
        ownerOf: (tokenId) => held.owners.get(tokenId),
        isKnown: (player) => held.known.has(player),
        sheet: (shown): BookCharacter => ({ name: shown.name ?? '', art: null, ring: null, resources: [] }),
        libraryStatblock: (placed) => held.library.get(placed.assetId ?? placed.imagePath) ?? null,
      });
    },
    played: (player) => {
      const character = characters.of(player);
      return character === null ? null : `${character.collection}:${character.key}:${character.sheet.name}`;
    },
  };
  return held;
}

const knight = token('knight');
const squire = token('squire');
const wolf = token('wolf');

describe('which character a player plays', () => {
  it('is the first token they own in the scene\'s order, as the players\' frame shows it', () => {
    const seats = table({ squire: ANA, knight: ANA, wolf: BEN });
    seats.read([wolf, knight, squire]);
    expect(seats.played(ANA)).toBe('Cairn:art/knight.webp:knight');
    expect(seats.played(BEN)).toBe('Cairn:art/wolf.webp:wolf');
    // A token nobody owns, and one of a player the table does not know, is nobody's character.
    seats.owners.set('wolf', 'stranger');
    seats.read([wolf, knight, squire]);
    expect(seats.characters.of('stranger')).toBeNull();
    expect(seats.played(BEN)).toBeNull();
  });

  it('stays while the scene shows none of their tokens, and is never read from a token players do not see', () => {
    const seats = table({ knight: ANA });
    // Hidden from the start: Ana has no character, and nothing was read of the token.
    seats.read([knight], ['knight']);
    expect(seats.played(ANA)).toBeNull();
    seats.read([knight]);
    expect(seats.played(ANA)).toBe('Cairn:art/knight.webp:knight');
    // Hidden again, another scene, a scene of another collection: it stays as it last was.
    seats.read([{ ...knight, imagePath: 'art/changed.webp' }], ['knight']);
    seats.read([wolf]);
    seats.read([wolf], [], 'Dolmenwood');
    expect(seats.played(ANA)).toBe('Cairn:art/knight.webp:knight');
    // While her character's token is only hidden, a second token of hers does not take its place.
    seats.owners.set('squire', ANA);
    seats.read([knight, squire], ['knight']);
    expect(seats.played(ANA)).toBe('Cairn:art/knight.webp:knight');
    // Without her character's token in the scene, the token she has there is her character.
    seats.read([squire]);
    expect(seats.played(ANA)).toBe('Cairn:art/squire.webp:squire');
  });

  it('is the token they chose, while it is theirs and shown, and stays until they choose another', () => {
    const seats = table({ knight: ANA, squire: ANA, wolf: BEN });
    seats.read([knight, squire, wolf]);
    expect(seats.characters.choose(ANA, 'squire')).toBe(true);
    expect(seats.characters.choose(ANA, 'squire')).toBe(false);
    seats.read([knight, squire, wolf]);
    expect(seats.played(ANA)).toBe('Cairn:art/squire.webp:squire');
    // Hidden, the chosen token stays her character; in a scene without it, the first of hers is.
    seats.read([knight, squire, wolf], ['squire']);
    expect(seats.played(ANA)).toBe('Cairn:art/squire.webp:squire');
    seats.read([knight, wolf]);
    expect(seats.played(ANA)).toBe('Cairn:art/knight.webp:knight');
    seats.read([knight, squire, wolf]);
    expect(seats.played(ANA)).toBe('Cairn:art/squire.webp:squire');
    seats.characters.choose(ANA, 'knight');
    seats.read([knight, squire, wolf]);
    expect(seats.played(ANA)).toBe('Cairn:art/knight.webp:knight');
    // A token that is not hers, or that players do not see, is passed over.
    seats.characters.choose(ANA, 'wolf');
    seats.read([knight, squire, wolf]);
    expect(seats.played(ANA)).toBe('Cairn:art/knight.webp:knight');
    expect(seats.played(BEN)).toBe('Cairn:art/wolf.webp:wolf');
    seats.characters.choose(ANA, 'squire');
    seats.read([knight, squire, wolf], ['squire']);
    expect(seats.played(ANA)).toBe('Cairn:art/knight.webp:knight');
  });

  it('ends at once when its token is in the scene and no longer theirs, or the table forgets the player', () => {
    const seats = table({ knight: ANA });
    seats.read([knight]);
    seats.owners.set('knight', BEN);
    seats.read([knight]);
    expect(seats.played(ANA)).toBeNull();
    expect(seats.played(BEN)).toBe('Cairn:art/knight.webp:knight');
    // Taken back by the GM while the token is hidden: gone all the same.
    seats.owners.delete('knight');
    seats.read([knight], ['knight']);
    expect(seats.played(BEN)).toBeNull();

    seats.owners.set('knight', ANA);
    seats.read([knight]);
    seats.read([wolf]);
    seats.known.delete(ANA);
    seats.read([wolf]);
    expect(seats.played(ANA)).toBeNull();
  });

  it('never opens one book to two players: a look-alike of a character someone plays is passed over', () => {
    const twin = { ...token('twin'), imagePath: knight.imagePath };
    const seats = table({ knight: ANA, twin: BEN, wolf: BEN });
    seats.read([knight, twin, wolf]);
    expect(seats.played(ANA)).toBe('Cairn:art/knight.webp:knight');
    expect(seats.played(BEN)).toBe('Cairn:art/wolf.webp:wolf');
    // Ana's knight hidden or in no scene: the book stays hers, the twin still opens none.
    seats.read([knight, twin], ['knight']);
    seats.read([twin]);
    expect(seats.played(ANA)).toBe('Cairn:art/knight.webp:knight');
    expect(seats.played(BEN)).toBe('Cairn:art/wolf.webp:wolf');
    // The same artwork in another collection is another character.
    seats.read([twin], [], 'Dolmenwood');
    expect(seats.played(BEN)).toBe('Dolmenwood:art/knight.webp:twin');
    // Once Ana plays someone else, the book is free.
    seats.owners.set('squire', ANA);
    seats.read([squire, twin]);
    seats.read([squire, twin]);
    expect(seats.played(ANA)).toBe('Cairn:art/squire.webp:squire');
    expect(seats.played(BEN)).toBe('Cairn:art/knight.webp:twin');
  });
});

describe('the scene as the books read it', () => {
  const lookup = { getCollectionForMap: (path: string): string | null => (path.includes('collections/Cairn/') ? 'Cairn' : null), getCollectionSettings: () => ({ conditions: [] }) };
  const source = fakeTokenSource(() => sceneState(), () => undefined, () => 70);

  it('names the scene\'s collection, none for a scene outside every collection', () => {
    expect(bookSceneOf(sceneState({ mapPath: 'atlas-vtt/collections/Cairn/scenes/a.atlasmap' }), source, null, lookup, () => undefined)).toMatchObject({ collection: 'Cairn', resources: [] });
    expect(bookSceneOf(sceneState({ mapPath: 'Scenes/Loose.atlasmap' }), source, null, lookup, () => undefined)).toMatchObject({ collection: '' });
    expect(bookSceneOf(sceneState({ mapPath: 'Scenes/Loose.atlasmap' }), source, null, null, () => undefined)).toMatchObject({ collection: '' });
  });

  it('is none while the scene loads, has no renderer, or lies in a collection Atlas does not know yet', () => {
    const mapPath = 'atlas-vtt/collections/Cairn/scenes/a.atlasmap';
    expect(bookSceneOf(sceneState({ mapPath, isMapLoading: true }), source, null, lookup, () => undefined)).toBeNull();
    expect(bookSceneOf(sceneState({ mapPath, mapLoaded: false }), source, null, lookup, () => undefined)).toBeNull();
    expect(bookSceneOf(sceneState({ mapPath }), null, null, lookup, () => undefined)).toBeNull();
    expect(bookSceneOf(sceneState({ mapPath: 'atlas-vtt/collections/Unknown/scenes/a.atlasmap' }), source, null, lookup, () => undefined)).toBeNull();
    expect(bookSceneOf(sceneState({ mapPath }), source, null, null, () => undefined)).toBeNull();
  });
});

describe('a character\'s statblock note', () => {
  it('is its token\'s own, else the one of the library token it was placed from, else none', () => {
    const seats = table({ knight: ANA, squire: BEN, wolf: 'cal' });
    seats.known.add('cal');
    seats.library.set('lib-squire', 'Characters/Squire.md');
    seats.library.set('art/wolf.webp', 'Characters/Wolf.md');
    const knight = token('knight', { kind: 'character', name: 'knight', statblockPath: 'Characters/Knight.md', assetId: 'lib-knight' } as Partial<TokenEntity>);
    seats.library.set('lib-knight', 'Characters/Other.md');
    seats.read([knight, token('squire', { assetId: 'lib-squire' }), token('wolf')]);
    expect(seats.characters.of(ANA)?.statblockPath).toBe('Characters/Knight.md');
    expect(seats.characters.of(BEN)?.statblockPath).toBe('Characters/Squire.md');
    expect(seats.characters.of('cal')?.statblockPath).toBe('Characters/Wolf.md');
    expect(seats.characters.statblockPaths()).toEqual(new Set(['Characters/Knight.md', 'Characters/Squire.md', 'Characters/Wolf.md']));
    seats.library.clear();
    seats.read([token('knight'), token('squire', { assetId: 'lib-squire' }), token('wolf')]);
    expect(seats.characters.of(ANA)?.statblockPath).toBeNull();
    expect(seats.characters.statblockPaths()).toEqual(new Set());
  });
});

describe('a character\'s sheet', () => {
  const shown: ShownRollToken = { name: '  Sir\u00a0Brannoch  ', imagePath: 'art/b.png', showRing: false, ringColor: '#fff' };
  const art = { hash: 'a'.repeat(64), size: 10, mime: 'image/png' };

  it('holds the resources its token has, by name and in their order, and nothing of the others', () => {
    const sheet = sheetOf(shown, { resources: { hp: { current: 3, max: 9 }, ac: { current: 14, max: 14 }, luck: { current: 1, max: 0 }, doom: { current: 5, max: 6 }, odd: { current: Number.NaN, max: 4 } } }, [
      { key: 'ac', name: 'Armour', field: 'ac', direction: 'static', color: '#00F', visibleToPlayers: true, slot: 3 },
      { key: 'hp', name: 'Hit Points', field: 'hp', direction: 'drains', color: '#CC3333', visibleToPlayers: true, slot: 0 },
      { key: 'doom', name: 'Doom', field: 'doom', direction: 'fills', color: '#111111', visibleToPlayers: false },
      { key: 'luck', name: 'Luck', field: 'luck', direction: 'fills', color: '#111111', visibleToPlayers: true },
      { key: 'odd', name: 'Odd', field: 'odd', direction: 'fills', color: '#111111', visibleToPlayers: true },
      { key: 'gone', name: 'Not on this token', field: 'gone', direction: 'fills', color: '#111111', visibleToPlayers: true },
    ], () => art);
    expect(sheet).toEqual({
      name: 'Sir Brannoch', art, ring: null,
      resources: [
        { key: 'hp', name: 'Hit Points', colour: '#cc3333', direction: 'drains', current: 3, max: 9, editable: true },
        { key: 'doom', name: 'Doom', colour: '#111111', direction: 'fills', current: 5, max: 6, editable: true },
        { key: 'ac', name: 'Armour', colour: '#0000ff', direction: 'static', current: 14, max: 14, editable: false },
      ],
    });
  });

  it('holds its resources the GM hides from players: they hide other tokens\' values, not a character\'s own', () => {
    // Daggerheart, as a campaign plays it: HP and Stress are hidden from players on the map.
    const definitions = DAGGERHEART.rules.resources ?? [];
    expect(definitions.every(({ visibleToPlayers }) => !visibleToPlayers)).toBe(true);
    const sheet = sheetOf(shown, { resources: { hp: { current: 4, max: 6 }, stress: { current: 1, max: 6 } } }, definitions, () => art);
    expect(sheet?.resources).toEqual([
      { key: 'hp', name: 'HP', colour: '#22c55e', direction: 'drains', current: 4, max: 6, editable: true },
      { key: 'stress', name: 'Stress', colour: '#a855f7', direction: 'fills', current: 1, max: 6, editable: true },
    ]);
  });

  it('has a ring where the token has one, white where it names no colour, and an empty name where the token has none', () => {
    expect(sheetOf({ name: null, imagePath: undefined, showRing: true, ringColor: undefined }, {}, [], () => art)).toEqual({ name: '', art: null, ring: '#ffffff', resources: [] });
  });
});
