import { describe, expect, it } from 'vitest';
import { currentTurn, turnKey, turnTokenIds } from '../../src/app/initiative/turnHolders';
import { TurnWatch, turnBannerOf } from '../../src/app/initiative/banner/turnBanner';
import { followedToken } from '../../src/app/initiative/followTurn';
import type { TokenEntity } from '../../src/app/types';
import { createDefaultInitiativeState, type InitiativeEntry, type InitiativeState, type SidesFight } from '../../src/app/types/initiativeTypes';

const token = (id: string, changes: Partial<TokenEntity> = {}): TokenEntity => ({ id, kind: 'token', x: 0, y: 0, imagePath: `art/${id}.webp`, ...changes } as TokenEntity);
const entry = (tokenId: string, order: number, changes: Partial<InitiativeEntry> = {}): InitiativeEntry => ({
  id: `e-${tokenId}`, tokenId, name: `${tokenId} card`, initiative: 20 - order, initiativeModifier: 0, imagePath: `art/${tokenId}.webp`, isActive: false, isNPC: true, order, ...changes,
});
const fight = (entries: InitiativeEntry[], changes: Partial<InitiativeState> = {}): InitiativeState => ({ ...createDefaultInitiativeState(), isActive: true, round: 1, entries, ...changes });

const tokens = {
  hero: token('hero', { name: 'Ayla', vision: { enabled: true } } as Partial<TokenEntity>),
  ally: token('ally', { vision: { enabled: true } } as Partial<TokenEntity>),
  ogre: token('ogre', { name: 'Grum' } as Partial<TokenEntity>),
  ghost: token('ghost', { name: 'Ghost', isHidden: true } as Partial<TokenEntity>),
};

describe('who holds the turn', () => {
  it('in turn order is the combatant with the turn, never a delayed one, and nobody outside a fight', () => {
    const order = fight([entry('hero', 0), entry('ogre', 1, { isActive: true })]);
    expect(turnTokenIds(order, tokens)).toEqual(['ogre']);
    expect(turnTokenIds({ ...order, isActive: false }, tokens)).toEqual([]);
    expect(turnTokenIds(fight([entry('ogre', 0, { isActive: true, delayed: true })]), tokens)).toEqual([]);
    expect(currentTurn(undefined)).toBeNull();
  });

  it('by sides is every acting combatant of the side with the turn, and of every side tied with it', () => {
    const sides: SidesFight = { first: 'players', active: 'players' };
    const entries = [entry('hero', 0), entry('ally', 1, { sitsOut: true }), entry('ogre', 2), entry('ghost', 3)];
    expect(turnTokenIds(fight(entries, { sides }), tokens)).toEqual(['hero']);
    expect(turnTokenIds(fight(entries, { sides: { ...sides, active: 'opponents' } }), tokens)).toEqual(['ogre', 'ghost']);
    const tied: SidesFight = { ...sides, roll: '1d6', rolls: { 1: { players: 4, opponents: 4 } } };
    expect(turnTokenIds(fight(entries, { sides: tied }), tokens)).toEqual(['hero', 'ogre', 'ghost']);
    // A defeated combatant holds no turn of its side; in turn order the holder keeps it
    expect(turnTokenIds(fight(entries, { sides: { ...sides, active: 'opponents' } }), tokens, new Set(['e-ogre']))).toEqual(['ghost']);
    expect(turnTokenIds(fight([entry('ogre', 0, { isActive: true })]), tokens, new Set(['e-ogre']))).toEqual(['ogre']);
  });

  it('tells turns apart by round and holder', () => {
    const one = currentTurn(fight([entry('ogre', 0, { isActive: true })]))!;
    const next = currentTurn(fight([entry('ogre', 0, { isActive: true })], { round: 2 }))!;
    const sides = currentTurn(fight([], { sides: { first: 'players', active: 'players' } }))!;
    expect(new Set([turnKey(one), turnKey(next), turnKey(sides)]).size).toBe(3);
  });
});

describe('the turn banner', () => {
  const order = fight([entry('hero', 0), entry('ogre', 1, { isActive: true }), entry('ghost', 2)]);

  it('names the turn by the name the map shows the GM, with the portrait and the round as a fight starts', () => {
    expect(turnBannerOf(null, order, tokens, { kind: 'gm' })).toEqual({
      key: turnKey(currentTurn(order)!), round: 1, title: 'Grum', portrait: { imagePath: 'art/ogre.webp', showRing: true, ringColor: undefined },
    });
    expect(turnBannerOf({ key: 'x', round: 1 }, order, tokens, { kind: 'gm' })?.round).toBeNull();
    expect(turnBannerOf({ key: 'x', round: 1 }, { ...order, round: 2 }, tokens, { kind: 'gm' })?.round).toBe(2);
  });

  it('gives players the entry\'s name only where their list shows names, and nothing for a hidden turn holder', () => {
    expect(turnBannerOf(null, order, tokens, { kind: 'players', showNames: true })?.title).toBe('ogre card');
    expect(turnBannerOf(null, order, tokens, { kind: 'players', showNames: false })).toMatchObject({ title: null, portrait: { imagePath: 'art/ogre.webp' } });
    const hidden = fight([entry('ghost', 0, { isActive: true })]);
    expect(turnBannerOf(null, hidden, tokens, { kind: 'players', showNames: true })).toBeNull();
    expect(turnBannerOf(null, hidden, tokens, { kind: 'gm' })?.title).toBe('Ghost');
  });

  it('names the side by sides, and tied sides together, without a portrait', () => {
    const sides = fight([], { sides: { first: 'players', active: 'opponents' } });
    expect(turnBannerOf(null, sides, tokens, { kind: 'players', showNames: false })).toMatchObject({ title: 'Opponents', portrait: null });
    const tied = fight([], { sides: { first: 'players', active: 'players', roll: '1d6', rolls: { 1: { players: 3, opponents: 3 } } } });
    expect(turnBannerOf(null, tied, tokens, { kind: 'gm' })?.title).toBe('Players and Opponents');
  });

  it('comes only when the turn moves on: not for a fight met running, a load, another scene, or the same turn', () => {
    const watch = new TurnWatch();
    const state = (initiative: InitiativeState, changes: Partial<{ mapPath: string; isMapLoading: boolean }> = {}) => ({ initiative, mapPath: 'a.atlasmap', isMapLoading: false, objects: { tokens }, ...changes });
    const second = fight([entry('hero', 0, { isActive: true }), entry('ogre', 1)]);
    expect(watch.next(state(order), { kind: 'gm' })).toBeNull();
    expect(watch.next(state(order), { kind: 'gm' })).toBeNull();
    expect(watch.next(state(second), { kind: 'gm' })).toMatchObject({ title: 'Ayla', round: null });
    expect(watch.next(state(order, { isMapLoading: true }), { kind: 'gm' })).toBeNull();
    expect(watch.next(state(second), { kind: 'gm' })).toBeNull();
    expect(watch.next(state(order, { mapPath: 'b.atlasmap' }), { kind: 'gm' })).toBeNull();
    expect(watch.next(state({ ...order, isActive: false }, { mapPath: 'b.atlasmap' }), { kind: 'gm' })).toBeNull();
    // A fight that starts again names its round
    expect(watch.next(state(order, { mapPath: 'b.atlasmap' }), { kind: 'gm' })).toMatchObject({ round: 1, title: 'Grum' });
  });
});

describe('following the turn', () => {
  it('goes to the first turn holder the canvas shows, and nowhere when it shows none', () => {
    const state = { initiative: fight([entry('hero', 0), entry('ogre', 1)], { sides: { first: 'opponents', active: 'opponents' } }), objects: { tokens: { ...tokens, ghost: token('ghost') } } };
    state.initiative.entries.push(entry('ghost', 2));
    expect(followedToken(state, () => true)?.id).toBe('ogre');
    expect(followedToken(state, (id) => id !== 'ogre')?.id).toBe('ghost');
    expect(followedToken(state, () => true, new Set(['e-ogre']))?.id).toBe('ghost');
    expect(followedToken(state, () => false)).toBeNull();
    // A combatant beside the map has nothing to go to
    state.objects.tokens.ogre = token('ogre', { offMap: true } as Partial<TokenEntity>);
    expect(followedToken(state, () => true)?.id).toBe('ghost');
  });
});
