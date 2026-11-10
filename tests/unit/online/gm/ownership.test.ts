import { describe, expect, it } from 'vitest';
import { selectedTokenIds, tokenLabel } from '../../../../src/app/online/gm/atlasView.ts';
import { Ownership } from '../../../../src/app/online/gm/ownership.ts';
import type { TokenAssignments } from '../../../../src/app/campaigns/players/tokenAssignments.ts';
import { FakeSeats } from './fakeSeats.ts';
import { sceneState, token } from './shareHarness.ts';

const ANA = 'a'.repeat(20);
const BEN = 'b'.repeat(20);
const CAL = 'c'.repeat(20);
const MAP = 'Scenes/Cave.atlasmap';
const seeing = token('seeing', { vision: { enabled: true } });
const blind = token('blind');

/** Ownership bound to a campaign of Ana and Ben unless `players` say otherwise, which assigns `assignments`. */
function ownership(assignments?: TokenAssignments, players: ConstructorParameters<typeof FakeSeats>[0] = [{ id: ANA, name: 'Ana' }, { id: BEN, name: 'Ben' }]): { readonly owners: Ownership; readonly seats: FakeSeats } {
  const owners = new Ownership();
  const seats = new FakeSeats(players, assignments);
  owners.bind(seats);
  return { owners, seats };
}

/** Ownership bound to the same campaign, as on another device or after a reload. */
function boundTo(seats: FakeSeats): Ownership {
  const owners = new Ownership();
  owners.bind(seats);
  return owners;
}

describe('token ownership', () => {
  it('keeps the owners of tokens placed from no library token in the campaign, where another table finds them', () => {
    const { owners, seats } = ownership();
    owners.give(['gm-fighter', 'gm-rogue'], {}, ANA);
    owners.give(['gm-rogue'], {}, BEN);
    expect(seats.assignments()).toEqual({ owners: { 'gm-fighter': ANA, 'gm-rogue': BEN }, playerTokens: {} });
    const again = boundTo(seats);
    expect(again.ownerOf('gm-fighter', undefined)).toBe(ANA);
    expect(again.ownerOf('gm-rogue', undefined)).toBe(BEN);
  });

  it('gives tokens back to nobody, and only to players of the campaign', () => {
    const { owners, seats } = ownership();
    owners.give(['gm-1', 'gm-2'], {}, ANA);
    owners.give(['gm-1'], {}, null);
    owners.give(['gm-2'], {}, 'c'.repeat(20));
    expect(seats.assignments().owners).toEqual({ 'gm-2': ANA });
  });

  it('reads an owner who is no player of the campaign as nobody', () => {
    const { owners } = ownership({ owners: { 'gm-1': CAL }, playerTokens: {} });
    expect(owners.ownerOf('gm-1', undefined)).toBeUndefined();
  });

  it('lists every campaign player, those online first, with the campaign\'s names; a joiner the campaign does not know is not listed', () => {
    const { owners } = ownership(undefined, [{ id: BEN, name: 'Ben' }, { id: ANA, name: 'Ana' }, { id: CAL, name: 'Cal' }]);
    expect(owners.list().map(({ name, online }) => [name, online])).toEqual([['Ana', false], ['Ben', false], ['Cal', false]]);
    owners.welcome([{ id: CAL, name: 'Cally' }, { id: 'e'.repeat(20), name: 'Eve' }]);
    expect(owners.list().map(({ name, online }) => [name, online])).toEqual([['Cal', true], ['Ana', false], ['Ben', false]]);
    expect([owners.nameOf(CAL), owners.nameOf('e'.repeat(20))]).toEqual(['Cal', null]);
    expect(owners.onlinePlayers()).toEqual([CAL, 'e'.repeat(20)]);
  });

  it('follows the campaign when its players change, and tells listeners', () => {
    const { owners, seats } = ownership();
    let changes = 0;
    owners.onChange(() => (changes += 1));
    seats.set([{ id: CAL, name: 'Cal', code: '123456', characters: [] }]);
    expect(owners.list().map(({ name }) => name)).toEqual(['Cal']);
    expect(changes).toBe(1);
  });

  it('follows who is online without writing the campaign, and a kick only forgets that the player is online', () => {
    const { owners, seats } = ownership();
    let changes = 0;
    owners.onChange(() => (changes += 1));
    owners.joined({ id: ANA, name: 'Ana' });
    owners.left(ANA);
    owners.joined({ id: ANA, name: 'Ana' });
    owners.give(['gm-1'], {}, ANA);
    owners.remove(ANA);
    expect(owners.onlinePlayers()).toEqual([]);
    expect(owners.nameOf(ANA)).toBe('Ana');
    expect(owners.ownerOf('gm-1', undefined)).toBe(ANA);
    // Four for who is online, two for the gift: the campaign's file changed, and so did the owners.
    expect(changes).toBe(6);
    expect(seats.assignments().owners).toEqual({ 'gm-1': ANA });
  });

  it('gives nothing and lists nobody while no campaign is bound', () => {
    const { owners, seats } = ownership();
    owners.bind(null);
    owners.give(['gm-1'], {}, ANA);
    expect([owners.list(), owners.nameOf(ANA), owners.ownerOf('gm-1', undefined), seats.assignments().owners]).toEqual([[], null, undefined, {}]);
  });
});

describe('player tokens', () => {
  it('are the tokens on the players\' side until the GM marks them, per scene, and outlive a table', () => {
    const { owners, seats } = ownership();
    expect([owners.isPlayerToken(MAP, 'seeing', seeing), owners.isPlayerToken(MAP, 'blind', blind)]).toEqual([true, false]);
    expect(owners.isPlayerToken(MAP, 'blind', { ...blind, side: 'players' })).toBe(true);
    owners.markPlayerTokens(MAP, ['seeing'], {}, false);
    owners.markPlayerTokens(MAP, ['blind'], {}, true);
    expect([owners.isPlayerToken(MAP, 'seeing', seeing), owners.isPlayerToken(MAP, 'blind', blind)]).toEqual([false, true]);
    expect(owners.isPlayerToken('Scenes/Other.atlasmap', 'seeing', seeing)).toBe(true);
    expect(seats.assignments().playerTokens).toEqual({ [MAP]: { seeing: false, blind: true } });
    expect(boundTo(seats).isPlayerToken(MAP, 'blind', blind)).toBe(true);
  });

  it('are marked on the played campaign while no table runs, and the table of that campaign finds them', () => {
    const played = new FakeSeats([{ id: ANA, name: 'Ana' }]);
    const owners = new Ownership(() => played);
    expect(owners.canMark()).toBe(true);
    expect(owners.markPlayerTokens(MAP, ['blind'], {}, true)).toBe(true);
    expect(owners.isPlayerToken(MAP, 'blind', blind)).toBe(true);
    owners.bind(played);
    expect(owners.isPlayerToken(MAP, 'blind', blind)).toBe(true);
  });

  it('are kept nowhere while no campaign is played', () => {
    const owners = new Ownership(() => null);
    expect([owners.canMark(), owners.markPlayerTokens(MAP, ['blind'], {}, true), owners.isPlayerToken(MAP, 'blind', blind)]).toEqual([false, false, false]);
  });

  it('are player tokens to players whether or not the GM gave them to anyone, and making a token the GM\'s takes it back', () => {
    const { owners } = ownership();
    expect(owners.claimOf(MAP, 'seeing', seeing)).toBe('taken');
    expect(owners.claimOf(MAP, 'blind', blind)).toBeNull();
    owners.give(['seeing'], {}, ANA);
    expect(owners.claimOf(MAP, 'seeing', seeing)).toBe('taken');
    owners.give(['blind'], {}, ANA);
    expect(owners.claimOf(MAP, 'blind', blind)).toBe('taken');
    expect(owners.seats(MAP, { seeing, blind, other: token('other') }).map(({ tokenId, owner }) => [tokenId, owner?.name])).toEqual([['seeing', 'Ana'], ['blind', 'Ana']]);
    owners.markPlayerTokens(MAP, ['seeing'], {}, false);
    expect([owners.ownerOf('seeing', undefined), owners.claimOf(MAP, 'seeing', seeing)]).toEqual([undefined, null]);
  });

  it('are given by the GM to a player it knows, and given back only by the GM', () => {
    const { owners } = ownership();
    owners.give(['seeing'], {}, 'c'.repeat(20));
    expect(owners.ownerOf('seeing', undefined)).toBeUndefined();
    owners.give(['seeing'], {}, ANA);
    expect(owners.ownerOf('seeing', undefined)).toBe(ANA);
    owners.give(['seeing'], {}, null);
    expect(owners.ownerOf('seeing', undefined)).toBeUndefined();
  });
});

describe('characters', () => {
  const hero = (id: string): ReturnType<typeof token> => token(id, { assetId: 'library-hero' });

  it('are the campaign\'s: a token placed from a library token gives every token placed from it, on every scene, and a new table finds it given', () => {
    const { owners, seats } = ownership();
    owners.give(['cave-hero'], { 'cave-hero': hero('cave-hero') }, ANA);
    expect(seats.gave).toEqual([['library-hero', ANA]]);
    expect(owners.ownerOf('hall-hero', hero('hall-hero'))).toBe(ANA);
    expect(owners.ownerOf('hall-goblin', token('hall-goblin', { assetId: 'library-goblin' }))).toBeUndefined();
    expect(owners.seats('Scenes/Hall.atlasmap', { 'hall-hero': hero('hall-hero'), other: token('other') }).map(({ tokenId, owner }) => [tokenId, owner?.name])).toEqual([['hall-hero', 'Ana']]);
    expect(seats.assignments().owners).toEqual({});
    expect(boundTo(seats).ownerOf('crypt-hero', hero('crypt-hero'))).toBe(ANA);
  });

  it('are written once however many of their tokens are given or taken back together', () => {
    const { owners, seats } = ownership();
    const tokens = { a: hero('a'), b: hero('b'), c: hero('c'), goblin: token('goblin', { assetId: 'library-goblin' }) };
    owners.give(['a', 'b', 'c', 'goblin'], tokens, ANA);
    expect(seats.gave).toEqual([['library-hero', ANA], ['library-goblin', ANA]]);
    owners.markPlayerTokens('Scenes/Cave.atlasmap', ['a', 'b', 'c'], tokens, false);
    expect(seats.gave.slice(2)).toEqual([['library-hero', null]]);
  });

  it('change hands, and go back to nobody, with any of their tokens; an owner a token had by its own id goes with it', () => {
    const { owners, seats } = ownership({ owners: { 'cave-hero': ANA }, playerTokens: {} });
    owners.give(['cave-hero'], { 'cave-hero': hero('cave-hero') }, ANA);
    owners.give(['cave-hero'], { 'cave-hero': hero('cave-hero') }, BEN);
    expect(seats.gave).toEqual([['library-hero', ANA], ['library-hero', BEN]]);
    expect([owners.ownerOf('hall-hero', hero('hall-hero')), seats.assignments().owners]).toEqual([BEN, {}]);
    owners.give(['hall-hero'], { 'hall-hero': hero('hall-hero') }, null);
    expect(owners.ownerOf('cave-hero', hero('cave-hero'))).toBeUndefined();
  });

  it('are taken back when one of their tokens becomes the GM\'s', () => {
    const { owners } = ownership(undefined, [{ id: ANA, name: 'Ana', characters: ['library-hero'] }]);
    expect(owners.ownerOf('hall-hero', hero('hall-hero'))).toBe(ANA);
    owners.markPlayerTokens(MAP, ['cave-hero'], { 'cave-hero': hero('cave-hero') }, false);
    expect(owners.ownerOf('hall-hero', hero('hall-hero'))).toBeUndefined();
  });

  it('stay with a player the GM kicks from the table, and go with one the campaign loses', () => {
    const { owners, seats } = ownership(undefined, [{ id: ANA, name: 'Ana', characters: ['library-hero'] }]);
    owners.welcome([{ id: ANA, name: 'Ana' }]);
    owners.remove(ANA);
    expect(owners.ownerOf('hall-hero', hero('hall-hero'))).toBe(ANA);
    seats.set([]);
    expect(owners.ownerOf('hall-hero', hero('hall-hero'))).toBeUndefined();
  });
});

describe('the GM\'s selection', () => {
  it('gives only tokens, and names them as the GM knows them', () => {
    const fighter = { ...token('f'), kind: 'character' as const, name: 'Fighter' };
    const state = { ...sceneState({ objects: { ...sceneState().objects, tokens: { f: fighter, g: token('g') } } }), selectedIds: ['wall-1', 'f', 'g'] };
    expect(selectedTokenIds(state)).toEqual(['f', 'g']);
    expect(selectedTokenIds(sceneState())).toEqual([]);
    expect([tokenLabel(fighter), tokenLabel(token('g'))]).toEqual(['Fighter', 'g']);
  });
});
