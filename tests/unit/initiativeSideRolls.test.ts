import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { createInitiativeActions } from '../../src/app/stores/initiativeSlice';
import { listedSides } from '../../src/app/initiative/sides';
import { roundTurns } from '../../src/app/initiative/sideOrder';
import { createDefaultInitiativeState, type InitiativeEntry } from '../../src/app/types/initiativeTypes';
import type { InitiativeRules, SideRef } from '../../src/app/types/initiativeRulesTypes';
import type { TokenEntity } from '../../src/app/types';

const ALLIES: SideRef = { id: 'side-allies', name: 'Allies' };
const SIDES: InitiativeRules = { mode: 'sides', roll: '1d20', firstSide: 'players' };
const THREE: InitiativeRules = { ...SIDES, sides: [{ id: 'players' }, ALLIES, { id: 'opponents' }] };

/** Chance whose d6 shows the faces in `faces`, one per roll, in order. */
function d6(faces: number[]): () => number {
  return () => ((faces.shift() ?? 1) - 1) / 6;
}

/** A tracker with a combatant on each of `sides` (by id). */
function setup(sides: string[], random: () => number) {
  const tokens = Object.fromEntries(sides.map((side) => [side, { id: side, kind: 'token', x: 0, y: 0, imagePath: '', side } as TokenEntity]));
  const entries = sides.map((side, order): InitiativeEntry => ({ id: side, tokenId: side, name: side, initiative: 0, initiativeModifier: 0, imagePath: '', isNPC: true, order, isActive: false }));
  let state = { initiative: { ...createDefaultInitiativeState(), entries }, initiativeTrackerOpen: true, objects: { tokens } };
  const actions = createInitiativeActions((recipe) => { state = produce(state, recipe); }, 'sides', () => state, random);
  return { actions, get: () => state };
}

type State = ReturnType<ReturnType<typeof setup>['get']>;
/** The round and the sides that have the turn. */
const turn = (state: State, rules: InitiativeRules): [number, string[]] =>
  [state.initiative.round, listedSides(state.initiative, rules).filter((side) => side.active).map((side) => side.id)];

describe('sides that roll for their order every round', () => {
  it('roll as the fight starts, the highest first, and show their rolls', () => {
    const rules = { ...SIDES, sideRoll: '1d6' };
    const { actions, get } = setup(['players', 'opponents'], d6([2, 5]));
    actions.startCombat(rules);
    // `first` follows the round's lead, as older versions read it
    expect(get().initiative.sides).toMatchObject({ first: 'opponents', active: 'opponents', roll: '1d6', rolls: { 1: { players: 2, opponents: 5 } } });
    expect(listedSides(get().initiative, rules).map((side) => [side.name, side.roll, side.active])).toEqual([['Opponents', 5, true], ['Players', 2, false]]);
  });

  it('act at the same time on equal rolls, and the turn steps past them as one', () => {
    const rules = { ...THREE, sideRoll: '1d6' };
    // Round 1: players 4, allies 4, opponents 6. Round 2: 1, 2, 3.
    const { actions, get } = setup(['players', 'side-allies', 'opponents'], d6([4, 4, 6, 9, 9, 9, 1, 2, 3]));
    actions.startCombat(rules);
    expect(turn(get(), rules)).toEqual([1, ['opponents']]);
    actions.nextTurn();
    expect(turn(get(), rules)).toEqual([1, ['players', 'side-allies']]);
    actions.nextTurn();
    expect(turn(get(), rules)).toEqual([2, ['opponents']]);
    expect(listedSides(get().initiative, rules).map((side) => side.roll)).toEqual([3, 2, 1]);
  });

  it('show the round before\'s rolls again when the turn steps back into it, and keep a round\'s rolls when it is entered again', () => {
    const rules = { ...SIDES, sideRoll: '1d6' };
    const { actions, get } = setup(['players', 'opponents'], d6([6, 1, 3, 3, 2, 5, 4, 4]));
    actions.startCombat(rules);
    actions.nextTurn();
    actions.nextTurn();
    const second = get().initiative.sides!.rolls![2];
    expect(turn(get(), rules)).toEqual([2, ['opponents']]);
    actions.previousTurn();
    expect(turn(get(), rules)).toEqual([1, ['opponents']]);
    expect(listedSides(get().initiative, rules).map((side) => side.roll)).toEqual([6, 1]);
    actions.nextTurn();
    expect(get().initiative.sides!.rolls![2]).toEqual(second);
  });
});

describe('more than two sides', () => {
  it('act in the collection\'s order, and a named side without combatants takes no turn', () => {
    const { actions, get } = setup(['players', 'opponents'], d6([]));
    actions.startCombat(THREE);
    expect(turn(get(), THREE)).toEqual([1, ['players']]);
    actions.nextTurn();
    expect(turn(get(), THREE)).toEqual([1, ['opponents']]);
    actions.nextTurn();
    expect(turn(get(), THREE)).toEqual([2, ['players']]);
  });

  it('give every side its turn in order, and step back through them', () => {
    const { actions, get } = setup(['players', 'side-allies', 'opponents'], d6([]));
    actions.startCombat(THREE);
    const seen = [turn(get(), THREE)];
    for (let step = 0; step < 3; step++) { actions.nextTurn(); seen.push(turn(get(), THREE)); }
    expect(seen).toEqual([[1, ['players']], [1, ['side-allies']], [1, ['opponents']], [2, ['players']]]);
    actions.previousTurn();
    actions.previousTurn();
    expect(turn(get(), THREE)).toEqual([1, ['side-allies']]);
  });

  it('pass by a side whose combatants are all defeated', () => {
    const { actions, get } = setup(['players', 'side-allies', 'opponents'], d6([]));
    actions.startCombat(THREE);
    actions.nextTurn(new Set(['side-allies']));
    expect(turn(get(), THREE)).toEqual([1, ['opponents']]);
  });

  it('read a token of a side the fight does not know as the default rule says', () => {
    const { actions, get } = setup(['players', 'side-gone', 'opponents'], d6([]));
    actions.startCombat(SIDES);
    actions.nextTurn();
    expect(turn(get(), SIDES)).toEqual([1, ['opponents']]);
  });
});

describe('named sides without combatants', () => {
  const NEUTRAL: InitiativeRules = { ...SIDES, sides: [{ id: 'side-neutral', name: 'Neutral' }, { id: 'players' }, { id: 'opponents' }] };

  it('never take the turn as the fight starts', () => {
    const { actions, get } = setup(['players', 'opponents'], d6([]));
    actions.startCombat(NEUTRAL);
    expect(turn(get(), NEUTRAL)).toEqual([1, ['players']]);
  });

  it('are passed by stepping back, and where no turn before acts the turn stays where it is', () => {
    const { actions, get } = setup(['players', 'opponents'], d6([]));
    actions.startCombat(NEUTRAL);
    actions.nextTurn();
    expect(turn(get(), NEUTRAL)).toEqual([1, ['opponents']]);
    actions.previousTurn();
    expect(turn(get(), NEUTRAL)).toEqual([1, ['players']]);
    actions.previousTurn();
    expect(turn(get(), NEUTRAL)).toEqual([1, ['players']]);
    // From round 2 back over its start, past the empty side, into round 1's last turn
    actions.nextTurn();
    actions.nextTurn();
    expect(turn(get(), NEUTRAL)).toEqual([2, ['players']]);
    actions.previousTurn();
    expect(turn(get(), NEUTRAL)).toEqual([1, ['opponents']]);
  });

  it('do not take a turn as a rolled round starts with them', () => {
    const rules = { ...NEUTRAL, sideRoll: '1d6' };
    // Neutral rolls highest in round 1
    const { actions, get } = setup(['players', 'opponents'], d6([6, 2, 4]));
    actions.startCombat(rules);
    expect(turn(get(), rules)).toEqual([1, ['opponents']]);
  });
});

describe('a rolled fight read by an older Atlas', () => {
  it('names the built-in side that leads each round as the side that acts first, and the round before\'s again on stepping back', () => {
    const rules = { ...SIDES, sideRoll: '1d6' };
    // Round 1: players 5, opponents 2. Round 2 (drawn by the second step): players 1, opponents 6
    const { actions, get } = setup(['players', 'opponents'], d6([5, 2, 9, 9, 1, 6]));
    actions.startCombat(rules);
    expect(get().initiative.sides?.first).toBe('players');
    actions.nextTurn();
    actions.nextTurn();
    expect(get().initiative.sides).toMatchObject({ first: 'opponents', active: 'opponents' });
    actions.previousTurn();
    expect(get().initiative.sides).toMatchObject({ first: 'players', active: 'opponents' });
    // The fight keeps its own list of sides, so a lead that changes moves no side
    expect(get().initiative.sides?.order).toEqual([{ id: 'players' }, { id: 'opponents' }]);
  });
});

describe('the turns of a round', () => {
  it('put a side without a roll last', () => {
    const fight = { first: 'players' as const, active: 'players', order: [{ id: 'players' }, ALLIES, { id: 'opponents' }], roll: '1d6', rolls: { 1: { players: 2, opponents: 5 } } };
    expect(roundTurns(fight, 1)).toEqual([['opponents'], ['players'], ['side-allies']]);
  });
});
