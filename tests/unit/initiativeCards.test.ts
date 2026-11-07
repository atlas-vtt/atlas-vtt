import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { createInitiativeActions } from '../../src/app/stores/initiativeSlice';
import { shuffledDeck } from '../../src/app/initiative/initiativeDice';
import { cardsShort } from '../../src/app/initiative/cardGroups';
import { createDefaultInitiativeState, type InitiativeEntry } from '../../src/app/types/initiativeTypes';
import type { InitiativeRules } from '../../src/app/types/initiativeRulesTypes';
import type { TokenEntity } from '../../src/app/types';

const CARDS: InitiativeRules = { mode: 'cards', roll: '1d20', firstSide: 'players' };

/** A random source that never shuffles: the deck deals 1, 2, 3, … in order. */
const inOrder = (): number => 0.999;

function token(id: string, extra: Partial<TokenEntity> = {}): TokenEntity {
  return { id, kind: 'token', x: 0, y: 0, imagePath: `${id}.webp`, ...extra } as TokenEntity;
}

function entry(id: string, order: number): InitiativeEntry {
  return { id, tokenId: id, name: id, initiative: 0, initiativeModifier: 0, imagePath: '', isNPC: true, order, isActive: false };
}

/** A tracker holding `tokens` as combatants, in that order, with `random` as its chance. */
function setup(tokens: TokenEntity[], random: () => number = inOrder) {
  let state = {
    initiative: { ...createDefaultInitiativeState(), entries: tokens.map((t, at) => entry(t.id, at)) },
    initiativeTrackerOpen: true,
    objects: { tokens: Object.fromEntries(tokens.map((t) => [t.id, t])) as Record<string, TokenEntity> },
  };
  const actions = createInitiativeActions((recipe) => { state = produce(state, recipe); }, 'cards', () => state, random);
  const get = (): typeof state => state;
  return { actions, get };
}

type State = ReturnType<ReturnType<typeof setup>['get']>;
const cards = (state: State): [string, number | undefined][] => state.initiative.entries.map((e) => [e.name, e.card]);
const turn = (state: State): [number, string | undefined] => [state.initiative.round, state.initiative.entries.find((e) => e.isActive)?.name];

/** Chance that plays back `values`, then never shuffles. */
function scripted(values: number[]): () => number {
  return () => values.shift() ?? 0.999;
}

/** Chance that never shuffles for its first `calls` draws (the first deck of ten takes nine), then always draws 0. */
function shufflesAfter(calls: number): () => number {
  let drawn = 0;
  return () => (drawn++ < calls ? 0.999 : 0);
}

describe('a fight by cards', () => {
  it('deals every combatant a card of the deck, the lowest first, and gives it the turn', () => {
    const { actions, get } = setup([token('a'), token('b'), token('c')], scripted([0, 0.5, 0.2]));
    actions.startCombat(CARDS);
    const dealt = cards(get());
    expect(new Set(dealt.map(([, card]) => card)).size).toBe(3);
    expect(dealt.every(([, card]) => card! >= 1 && card! <= 10)).toBe(true);
    expect(dealt.map(([, card]) => card)).toEqual([...dealt.map(([, card]) => card!)].sort((x, y) => x - y));
    expect(turn(get())).toEqual([1, dealt[0]![0]]);
    expect(get().initiative.cards).toEqual({ deck: 10 });
  });

  it('shuffles the deck with the chance it is given', () => {
    expect(shuffledDeck(5, inOrder)).toEqual([1, 2, 3, 4, 5]);
    const shuffled = shuffledDeck(10, scripted([0.3, 0.9, 0.1, 0.6, 0, 0.4, 0.8, 0.2, 0.7]));
    expect([...shuffled].sort((x, y) => x - y)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(shuffled).not.toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('lets look-alikes that are not on the players\' side share one card where the rules say so', () => {
    const goblin = { imagePath: 'goblin.webp' };
    const { actions, get } = setup([token('hero', { imagePath: 'hero.webp', vision: { enabled: true } }), token('g1', goblin), token('g2', goblin), token('wolf')]);
    actions.startCombat({ ...CARDS, lookAlikesShare: true });
    expect(cards(get())).toEqual([['hero', 1], ['g1', 2], ['g2', 2], ['wolf', 3]]);
  });

  it('lets look-alikes share anyway where the deck is too small for one card each, and says how many are missing beyond that', () => {
    const goblin = { imagePath: 'goblin.webp' };
    const tokens = [token('a'), token('g1', goblin), token('g2', goblin), token('g3', goblin)];
    const { actions, get } = setup(tokens);
    actions.startCombat({ ...CARDS, deck: 3 });
    expect(cards(get())).toEqual([['a', 1], ['g1', 2], ['g2', 2], ['g3', 2]]);
    expect(cardsShort({ deck: 3 }, get().initiative.entries, get().objects.tokens)).toBe(0);
    expect(cardsShort({ deck: 2 }, [...get().initiative.entries, entry('b', 4), entry('c', 5)], { ...get().objects.tokens, b: token('b'), c: token('c') })).toBe(2);
  });

  it('keeps the cards from round to round where they are dealt once, and deals a newcomer one nobody holds', () => {
    const { actions, get } = setup([token('a'), token('b')]);
    actions.startCombat(CARDS);
    actions.addToInitiative({ tokenId: 'c', name: 'c', initiative: 0, initiativeModifier: 0, imagePath: '', isNPC: true });
    // Without a card yet, the newcomer acts after everyone else
    actions.nextTurn();
    actions.nextTurn();
    expect(turn(get())).toEqual([1, 'c']);
    actions.nextTurn();
    expect(turn(get())).toEqual([2, 'a']);
    expect(cards(get())).toEqual([['a', 1], ['b', 2], ['c', 3]]);
  });

  it('never changes a card dealt once when a newcomer makes look-alikes share, and leaves a newcomer the deck has no card for without one', () => {
    const goblin = { imagePath: 'goblin.webp' };
    const { actions, get } = setup([token('p', { vision: { enabled: true } }), token('g1', goblin), token('g2', goblin)]);
    actions.startCombat({ ...CARDS, deck: 3 });
    expect(cards(get())).toEqual([['p', 1], ['g1', 2], ['g2', 3]]);
    actions.addToInitiative({ tokenId: 'z', name: 'z', initiative: 0, initiativeModifier: 0, imagePath: '', isNPC: true });
    actions.nextTurn();
    actions.nextTurn();
    actions.nextTurn();
    actions.nextTurn();
    expect(get().initiative.round).toBe(2);
    expect(cards(get())).toEqual([['p', 1], ['g1', 2], ['g2', 3], ['z', undefined]]);
  });

  it('gives a newcomer that looks like a combatant holding a card that card, where look-alikes share', () => {
    const goblin = { imagePath: 'goblin.webp' };
    const { actions, get } = setup([token('p', { vision: { enabled: true } }), token('g1', goblin), token('g2', goblin)]);
    // g2 is on the map and joins after the deal
    actions.removeFromInitiative('g2');
    actions.startCombat({ ...CARDS, lookAlikesShare: true });
    actions.addToInitiative({ tokenId: 'g2', name: 'g2', initiative: 0, initiativeModifier: 0, imagePath: '', isNPC: true });
    actions.nextTurn();
    actions.nextTurn();
    actions.nextTurn();
    expect(cards(get())).toEqual([['p', 1], ['g1', 2], ['g2', 2]]);
  });

  it('deals anew every round where the rules say so, and stepping back and on shows each round\'s cards again', () => {
    // Round 1 deals 1, 2, 3 in order; every later deck is shuffled
    const { actions, get } = setup([token('a'), token('b'), token('c')], shufflesAfter(9));
    actions.startCombat({ ...CARDS, dealEachRound: true });
    const first = cards(get());
    expect(first).toEqual([['a', 1], ['b', 2], ['c', 3]]);
    actions.nextTurn();
    actions.nextTurn();
    actions.nextTurn();
    const second = cards(get());
    expect(get().initiative.round).toBe(2);
    expect(second).not.toEqual(first);
    expect(turn(get())[1]).toBe(second[0]![0]);

    actions.previousTurn();
    expect(get().initiative.round).toBe(1);
    expect(cards(get())).toEqual(first);
    expect(turn(get())).toEqual([1, 'c']);
    actions.nextTurn();
    expect(cards(get())).toEqual(second);
  });

  it('swaps two combatants\' cards, and the turn stays with the card that had it: a combatant waiting hands it on', () => {
    const { actions, get } = setup([token('a'), token('b'), token('c')]);
    actions.startCombat(CARDS);
    expect(turn(get())).toEqual([1, 'a']);
    // a waits: it swaps with c, who acts now on card 1
    actions.swapInitiativeCards('a', 'c');
    expect(cards(get())).toEqual([['c', 1], ['b', 2], ['a', 3]]);
    expect(turn(get())).toEqual([1, 'c']);
    // Two combatants without the turn swap; the turn stays where it is
    actions.swapInitiativeCards('b', 'a');
    expect(cards(get())).toEqual([['c', 1], ['a', 2], ['b', 3]]);
    expect(turn(get())).toEqual([1, 'c']);
  });

  it('swaps a shared card for all who share it', () => {
    const goblin = { imagePath: 'goblin.webp' };
    const { actions, get } = setup([token('a'), token('g1', goblin), token('g2', goblin)]);
    actions.startCombat({ ...CARDS, lookAlikesShare: true });
    actions.swapInitiativeCards('g2', 'a');
    expect(cards(get())).toEqual([['g1', 1], ['g2', 1], ['a', 2]]);
  });

  it('keeps the order of the cards when a number is edited, and ends with the cards taken back', () => {
    const { actions, get } = setup([token('a'), token('b')]);
    actions.startCombat(CARDS);
    actions.updateInitiativeEntry('b', { initiative: 30 });
    expect(cards(get())).toEqual([['a', 1], ['b', 2]]);
    actions.endCombat();
    expect(get().initiative.cards).toBeUndefined();
    expect(cards(get())).toEqual([['a', undefined], ['b', undefined]]);
  });

  it('passes the turn on when the combatant with it leaves, and deals as a new round begins', () => {
    const { actions, get } = setup([token('a'), token('b')], scripted([0.999, 0.999]));
    actions.startCombat({ ...CARDS, dealEachRound: true });
    actions.nextTurn();
    actions.removeFromInitiative(get().initiative.entries.find((e) => e.isActive)!.id);
    expect(get().initiative.round).toBe(2);
    expect(get().initiative.entries[0]!.card).toBeDefined();
  });
});
