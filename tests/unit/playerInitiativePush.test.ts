// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { playerInitiativeList, renderPlayerInitiative, playerSegments, type EntryToken, type PlayerInitiativeEntry } from '../../src/app/services/playerInitiativeList';
import { movedOnBy, TurnPushWatch } from '../../src/app/services/playerInitiativePush';
import type { InitiativeRules } from '../../src/app/types/initiativeRulesTypes';

const TURN_ORDER: InitiativeRules = { mode: 'turn-order', roll: '1d20', firstSide: 'players' };
const VISIBLE: EntryToken = { hp: null, showRing: false, side: 'opponents', defeated: false };
const fight = (active: number): PlayerInitiativeEntry[] =>
  ['a', 'b', 'c'].map((name, order) => ({ tokenId: name, name, initiative: 20 - order, imagePath: '', order, isActive: order === active }));
const listOf = (active: number) => playerInitiativeList({ entries: fight(active), isActive: true, round: 2 }, () => VISIBLE, TURN_ORDER, false);

describe('the row that starts at the turn, as the turn passes on', () => {
  it('knows by how many places the order moved on from any other change', () => {
    expect(movedOnBy(['a', 'b', 'c'], ['b', 'c', 'a'])).toBe(1);
    // Passing by one who sits the round out: two leave the front
    expect(movedOnBy(['a', 'b', 'c'], ['c', 'a', 'b'])).toBe(2);
    expect(movedOnBy(['a', 'b', 'c'], ['b', 'c'])).toBe(0);
    expect(movedOnBy(['a', 'b', 'c'], ['a', 'c', 'b'])).toBe(0);
    expect(movedOnBy(['a'], ['a'])).toBe(0);
    // A list that shows only so many: the next in line comes in at the end
    expect(movedOnBy(['a', 'b', 'c'], ['b', 'c', 'd'])).toBe(1);
  });

  it('glides out who acted together with whom the turn passed by, and nothing as the turn goes back', () => {
    const four = (active: number): ReturnType<typeof listOf> => playerInitiativeList({
      entries: ['a', 'b', 'c', 'd'].map((name, order) => ({ tokenId: name, name, initiative: 20 - order, imagePath: '', order, isActive: order === active, ...(name === 'b' ? { sitsOut: true } : {}) })),
      isActive: true, round: 2,
    }, () => VISIBLE, TURN_ORDER, false);
    const watch = new TurnPushWatch();
    watch.see(playerSegments(four(0), true), four(0), true);
    const push = watch.see(playerSegments(four(2), true), four(2), true);
    expect(push?.combatants.map(({ entry }) => entry.name)).toEqual(['a', 'b']);
    document.body.empty();
    renderPlayerInitiative(document.body, four(2), { showNames: true, mapShowsNameplates: true, portraitSrc: () => null, fromTurn: true, dock: 'bottom', push });
    const leaving = document.querySelector('.atlas-player-initiative__leaving');
    expect([...(leaving?.querySelectorAll('.atlas-player-initiative__name') ?? [])].map((name) => name.textContent)).toEqual(['a', 'b']);
    // They come in as one group at the end, never folded over each other
    const arriving = [...document.querySelectorAll('.atlas-player-initiative__push-in')];
    expect(arriving).toHaveLength(1);
    expect([...arriving[0]!.querySelectorAll('.atlas-player-initiative__name')].map((name) => name.textContent)).toEqual(['a', 'b']);
    // Back again: the same order as two places on, but no push
    const back = new TurnPushWatch();
    back.see(playerSegments(four(2), true), four(2), true);
    expect(back.see(playerSegments(four(0), true), four(0), true)).toBeUndefined();
  });

  it('pushes who acted out at the front while its card comes in at the end, and keeps the push through redraws', () => {
    const watch = new TurnPushWatch();
    expect(watch.see(playerSegments(listOf(0), true), listOf(0), true)).toBeUndefined();
    const push = watch.see(playerSegments(listOf(1), true), listOf(1), true);
    expect(push?.combatants.map(({ entry }) => entry.name)).toEqual(['a']);
    // A redraw of the same order goes on with it
    expect(watch.see(playerSegments(listOf(1), true), listOf(1), true)?.combatants[0]?.entry.name).toBe('a');
    // Not where the list keeps its order
    expect(new TurnPushWatch().see(playerSegments(listOf(1), false), listOf(1), false)).toBeUndefined();

    document.body.empty();
    renderPlayerInitiative(document.body, listOf(1), { showNames: true, mapShowsNameplates: true, portraitSrc: () => null, fromTurn: true, dock: 'bottom', push });
    // Each round's cards over its name, with no divider of its own between them
    const groups = [...document.querySelectorAll('.atlas-player-initiative__round-group')];
    expect(groups.map((group) => group.querySelector('.atlas-player-initiative__round-label')?.textContent)).toEqual(['Round 2', 'Round 3']);
    expect(document.querySelector('.atlas-player-initiative__next-round, .atlas-player-initiative__round')).toBeNull();
    const names = (group: Element | undefined): string[] => [...(group?.querySelectorAll('.atlas-player-initiative__card') ?? [])].map((card) => card.querySelector('.atlas-player-initiative__name')?.textContent ?? '');
    // Who acted leaves at the front of this round, and comes in at the end of the next
    expect(names(groups[0])).toEqual(['a', 'b', 'c']);
    expect(names(groups[1])).toEqual(['a']);
    const leaving = groups[0]?.querySelector('.atlas-player-initiative__card');
    expect(leaving?.classList.contains('atlas-player-initiative__leaving')).toBe(true);
    expect(leaving?.getAttribute('aria-hidden')).toBe('true');
    expect(groups[1]?.querySelector('.atlas-player-initiative__card')?.classList.contains('atlas-player-initiative__push-in')).toBe(true);
    // A column has no conveyor
    document.body.empty();
    renderPlayerInitiative(document.body, listOf(1), { showNames: true, mapShowsNameplates: true, portraitSrc: () => null, fromTurn: true, dock: 'right', push });
    expect(document.querySelector('.atlas-player-initiative__card--push-out')).toBeNull();
  });

  it('shows only so many cards, and the next in line comes in as the turn passes on', () => {
    const watch = new TurnPushWatch();
    watch.see(playerSegments(listOf(0), true, 2), listOf(0), true);
    const push = watch.see(playerSegments(listOf(1), true, 2), listOf(1), true);
    expect(push).toMatchObject({ combatants: [{ entry: { name: 'a' } }], newRound: false });
    document.body.empty();
    renderPlayerInitiative(document.body, listOf(1), { showNames: true, mapShowsNameplates: true, portraitSrc: () => null, fromTurn: true, dock: 'bottom', push, maxCards: 2 });
    const groups = [...document.querySelectorAll('.atlas-player-initiative__round-group')];
    const names = [...(groups[0]?.querySelectorAll('.atlas-player-initiative__card') ?? [])].map((card) => card.querySelector('.atlas-player-initiative__name')?.textContent);
    // Who acted leaves at the front of the same round; c comes in at the end
    expect(groups).toHaveLength(1);
    expect(names).toEqual(['a', 'b', 'c']);
    expect(groups[0]?.querySelector('.atlas-player-initiative__push-in .atlas-player-initiative__name')?.textContent).toBe('c');
  });

  it('pushes the round before out with its name as the new round begins', () => {
    const watch = new TurnPushWatch();
    watch.see(playerSegments(listOf(2), true), listOf(2), true);
    const next = playerInitiativeList({ entries: fight(0), isActive: true, round: 3 }, () => VISIBLE, TURN_ORDER, false);
    const push = watch.see(playerSegments(next, true), next, true);
    expect(push?.combatants.map(({ entry }) => entry.name)).toEqual(['c']);
    document.body.empty();
    renderPlayerInitiative(document.body, next, { showNames: true, mapShowsNameplates: true, portraitSrc: () => null, fromTurn: true, dock: 'top', push });
    const groups = [...document.querySelectorAll('.atlas-player-initiative__round-group')];
    expect(groups.map((group) => group.querySelector('.atlas-player-initiative__round-label')?.textContent)).toEqual(['Round 2', 'Round 3']);
    expect(groups[0]?.classList.contains('atlas-player-initiative__leaving')).toBe(true);
  });
});
