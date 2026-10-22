import { describe, expect, it } from 'vitest';
import {
  isValidInitiativeRules,
  parseInitiativeRules,
  sameInitiativeRules,
  savedInitiativeRules,
} from '../../src/app/gameSystems/initiativeRules';
import { parseSideList, sidesOfRules, newSideId, MAX_SIDES } from '../../src/app/gameSystems/initiativeSideRules';
import { deckSize } from '../../src/app/gameSystems/initiativeCardRules';
import { isSameAsTyped } from '../../src/app/gameSystems/rulesView';
import { BUILT_IN_SYSTEM_PRESETS } from '../../src/app/gameSystems/builtInPresets';
import { collectionInitiativeRules } from '../../src/app/gameSystems/initiativeRules';
import type { InitiativeRules } from '../../src/app/types/initiativeRulesTypes';

const SIDES: InitiativeRules = { mode: 'sides', roll: '1d20', firstSide: 'players' };
const CARDS: InitiativeRules = { mode: 'cards', roll: '1d20', firstSide: 'players' };
const ALLIES = { id: 'side-allies', name: 'Allies' };

describe('initiative dealt from a deck of cards', () => {
  it('reads the mode, the deck and its switches, and leaves out what is the default', () => {
    expect(parseInitiativeRules({ ...CARDS, deck: 12, dealEachRound: true, lookAlikesShare: true })).toEqual({ ...CARDS, deck: 12, dealEachRound: true, lookAlikesShare: true });
    expect(parseInitiativeRules({ ...CARDS, deck: 10, dealEachRound: 'yes', lookAlikesShare: 1 })).toEqual(CARDS);
    for (const deck of [1, 51, 7.5, '12', null]) expect(parseInitiativeRules({ ...CARDS, deck })).toEqual(CARDS);
    expect(deckSize(CARDS)).toBe(10);
  });

  it('compares an unset deck with one of ten, and the switches by whether they are on', () => {
    expect(sameInitiativeRules(CARDS, { ...CARDS, deck: 10 })).toBe(true);
    expect(sameInitiativeRules(CARDS, { ...CARDS, deck: 12 })).toBe(false);
    expect(sameInitiativeRules(CARDS, { ...CARDS, dealEachRound: true })).toBe(false);
    expect(sameInitiativeRules({ ...CARDS, lookAlikesShare: true }, { ...CARDS, lookAlikesShare: true })).toBe(true);
    // As typed, a deck of 10 is the GM's own
    expect(isSameAsTyped({ ...CARDS, deck: 10 }, CARDS)).toBe(false);
  });

  it('cannot be saved with a deck that is no size', () => {
    expect(isValidInitiativeRules({ ...CARDS, deck: Number.NaN })).toBe(false);
    expect(isValidInitiativeRules({ ...CARDS, deck: 1 })).toBe(false);
    expect(isValidInitiativeRules({ ...CARDS, deck: 20, roll: '1d' })).toBe(true);
    expect(savedInitiativeRules({ ...CARDS, deck: 10, dealEachRound: true })).toEqual({ ...CARDS, dealEachRound: true });
  });
});

describe('the sides of a collection', () => {
  it('reads a list of sides: named ones need a name, ids are unique, the built-in two are always there', () => {
    expect(parseSideList([{ id: 'opponents' }, ALLIES, { id: 'side-x', name: '  ' }, { id: 'side-allies', name: 'Twice' }, { id: 7 }]))
      .toEqual([{ id: 'opponents' }, ALLIES, { id: 'players' }]);
    expect(parseSideList('players')).toBeUndefined();
    const many = Array.from({ length: 12 }, (_, at) => ({ id: `side-${at}`, name: `Side ${at}` }));
    const parsed = parseSideList([...many, { id: 'players' }])!;
    expect(parsed).toHaveLength(MAX_SIDES);
    expect(parsed.map((side) => side.id)).toEqual(expect.arrayContaining(['players', 'opponents']));
  });

  it('keeps the first of the players and the opponents in `firstSide`, as older versions read it, and no list that says no more', () => {
    expect(parseInitiativeRules({ ...SIDES, sides: [ALLIES, { id: 'opponents' }, { id: 'players' }] }))
      .toEqual({ ...SIDES, firstSide: 'opponents', sides: [ALLIES, { id: 'opponents' }, { id: 'players' }] });
    expect(parseInitiativeRules({ ...SIDES, firstSide: 'players', sides: [{ id: 'opponents' }, { id: 'players' }] }))
      .toEqual({ ...SIDES, firstSide: 'opponents' });
    expect(sidesOfRules(SIDES)).toEqual([{ id: 'players' }, { id: 'opponents' }]);
  });

  it('reads the dice the sides roll for their order', () => {
    expect(parseInitiativeRules({ ...SIDES, sideRoll: ' 1d6 ' })).toEqual({ ...SIDES, sideRoll: '1d6' });
    expect(parseInitiativeRules({ ...SIDES, sideRoll: 'd' })).toEqual(SIDES);
    expect(sameInitiativeRules({ ...SIDES, sideRoll: '1D6' }, { ...SIDES, sideRoll: '1d6' })).toBe(true);
    expect(sameInitiativeRules(SIDES, { ...SIDES, sideRoll: '1d6' })).toBe(false);
  });

  it('compares the lists in order and with their names; an unset list is `firstSide` and the other', () => {
    expect(sameInitiativeRules(SIDES, { ...SIDES, sides: [{ id: 'players' }, { id: 'opponents' }] })).toBe(true);
    expect(sameInitiativeRules(SIDES, { ...SIDES, sides: [{ id: 'players' }, ALLIES, { id: 'opponents' }] })).toBe(false);
    expect(sameInitiativeRules(
      { ...SIDES, sides: [{ id: 'players' }, ALLIES, { id: 'opponents' }] },
      { ...SIDES, sides: [{ id: 'players' }, { ...ALLIES, name: 'Hirelings' }, { id: 'opponents' }] },
    )).toBe(false);
  });

  it('cannot be saved while a named side has no name or the side roll is no dice', () => {
    expect(isValidInitiativeRules({ ...SIDES, sides: [{ id: 'players' }, { id: 'side-new', name: '' }, { id: 'opponents' }] })).toBe(false);
    expect(isValidInitiativeRules({ ...SIDES, sideRoll: '1d' })).toBe(false);
    expect(isValidInitiativeRules({ ...SIDES, sideRoll: '1d6', sides: [{ id: 'players' }, ALLIES, { id: 'opponents' }] })).toBe(true);
  });

  it('gives a new side an id no other side has', () => {
    const values = [0, 0, 0.5];
    const random = (): number => values.shift() ?? 0.9;
    const first = newSideId([], () => 0);
    expect(newSideId([first], random)).not.toBe(first);
  });
});

describe('parts of another mode left behind', () => {
  const TURN_ORDER: InitiativeRules = { mode: 'turn-order', roll: '1d20', firstSide: 'players' };

  it('are no edit and are not stored: a side roll or a deck set before switching back to turn order', () => {
    const leftover = { ...TURN_ORDER, sideRoll: '1d6', sides: [{ id: 'players' }, ALLIES, { id: 'opponents' }], deck: 20, dealEachRound: true as const };
    expect(sameInitiativeRules(TURN_ORDER, leftover)).toBe(true);
    expect(isSameAsTyped(leftover, TURN_ORDER)).toBe(true);
    expect(savedInitiativeRules(leftover)).toEqual(TURN_ORDER);
  });

  it('count in their own mode: cards by sides do not, sides by cards do not', () => {
    expect(sameInitiativeRules(SIDES, { ...SIDES, deck: 20 })).toBe(true);
    expect(sameInitiativeRules(CARDS, { ...CARDS, sideRoll: '1d6' })).toBe(true);
    expect(savedInitiativeRules({ ...CARDS, sideRoll: '1d6', deck: 12 })).toEqual({ ...CARDS, deck: 12 });
    expect(isSameAsTyped({ ...SIDES, sideRoll: '1d6' }, SIDES)).toBe(false);
  });
});

describe('rules an older Atlas wrote', () => {
  it('read as they always did, and rules of a mode it does not know read as none', () => {
    expect(parseInitiativeRules({ mode: 'sides', roll: '1d20', firstSide: 'opponents' })).toEqual({ mode: 'sides', roll: '1d20', firstSide: 'opponents' });
    expect(parseInitiativeRules({ mode: 'chits', roll: '1d20', firstSide: 'players' })).toBeUndefined();
  });
});

describe('the Old-School Essentials preset', () => {
  it('rolls a d6 for every side at the start of each round', () => {
    const ose = BUILT_IN_SYSTEM_PRESETS.find((preset) => preset.name === 'Old-School Essentials')!;
    expect(collectionInitiativeRules({ systemPresetId: ose.id }, BUILT_IN_SYSTEM_PRESETS)).toMatchObject({ mode: 'sides', sideRoll: '1d6' });
  });
});
