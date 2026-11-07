import { describe, expect, it } from 'vitest';
import { restOutcome } from '../../../src/app/recovery/restOutcome';
import { restPlan } from '../../../src/app/recovery/restPlan';
import type { RecoveryRule } from '../../../src/app/recovery/recoveryTypes';
import type { CharacterChanges, RestChoices, RestOutcome, RestRoller } from '../../../src/app/recovery/restTypes';
import { button, character, roller, row, type CharacterState } from './restFixtures';

const HP = { kind: 'resource', field: 'hp' } as const;
const STRESS = { kind: 'resource', field: 'stress' } as const;
const HIT_DICE = { kind: 'resource', field: 'hitDice' } as const;
const EXHAUSTION = { kind: 'condition', id: 'exhaustion' } as const;
/** What the rest changed of Mira. */
const own = (outcome: RestOutcome): CharacterChanges => outcome.byCharacter.get('mira') ?? { resources: new Map(), counters: new Map(), conditions: new Map() };

const NO_CHOICES: RestChoices = { picks: [], spends: new Map() };

function rest(rules: RecoveryRule[], state: CharacterState, roll: RestRoller = roller(), choices: RestChoices = NO_CHOICES) {
  const who = character(state);
  return restOutcome(restPlan(button(rules), who), who, choices, roll);
}

const summary = (outcome: ReturnType<typeof rest>) => outcome.changes.map(({ label, from, to, rolls }) => ({ label, from, to, rolls: rolls.map((roll) => roll.formula) }));

describe('resources', () => {
  const hurt = { resources: { hp: { current: 4, max: 20 }, stress: { current: 5, max: 6 } } };

  it('fills a draining resource and empties a filling one', () => {
    const outcome = rest([{ target: HP, does: 'full' }, { target: STRESS, does: 'full' }], hurt);
    expect(summary(outcome)).toEqual([
      { label: 'HP', from: 4, to: 20, rolls: [] },
      { label: 'Stress', from: 5, to: 0, rolls: [] },
    ]);
    expect(own(outcome).resources.get('hp')).toEqual({ current: 20, max: 20 });
  });

  it('rolls an amount with dice towards the good end, clamped to the maximum', () => {
    const roll = roller(7, 30);
    const outcome = rest([{ target: HP, does: 'amount', formula: '2d8+2' }, { target: STRESS, does: 'amount', formula: '1d4' }], hurt, roll);
    expect(summary(outcome)).toEqual([
      { label: 'HP', from: 4, to: 11, rolls: ['2d8+2'] },
      { label: 'Stress', from: 5, to: 0, rolls: ['1d4'] },
    ]);
    expect(roll.rolled).toEqual([{ formula: '2d8+2', label: 'HP (Long rest)' }, { formula: '1d4', label: 'Stress (Long rest)' }]);
  });

  it('works out an amount without dice and never rolls it', () => {
    const roll = roller();
    const outcome = rest([{ target: HP, does: 'amount', formula: '@level' }], { ...hurt, note: { level: 5 } }, roll);
    expect(summary(outcome)).toEqual([{ label: 'HP', from: 4, to: 9, rolls: [] }]);
    expect(roll.rolled).toEqual([]);
  });

  it('gives at least the minimum and never takes away', () => {
    expect(summary(rest([{ target: HP, does: 'amount', formula: '1d4-3', min: 1 }], hurt, roller(-2)))[0]!.to).toBe(5);
    expect(rest([{ target: HP, does: 'amount', formula: '1d4-3' }], hurt, roller(-2)).changes).toEqual([]);
  });

  it('gives back a share of the maximum, rounded as the rule says', () => {
    expect(summary(rest([{ target: HP, does: 'share', share: 0.25, round: 'down' }], { resources: { hp: { current: 0, max: 18 } } }))[0]!.to).toBe(4);
    expect(summary(rest([{ target: HP, does: 'share', share: 0.25, round: 'up' }], { resources: { hp: { current: 0, max: 18 } } }))[0]!.to).toBe(5);
    expect(summary(rest([{ target: HP, does: 'share', share: 0.5, round: 'down', min: 3 }], { resources: { hp: { current: 0, max: 2 } } }))[0]!.to).toBe(2);
    expect(summary(rest([{ target: STRESS, does: 'share', share: 0.5, round: 'up' }], hurt))[0]!.to).toBe(2);
  });

  it('sets a number or a field\'s number', () => {
    expect(summary(rest([{ target: STRESS, does: 'set', to: 0 }], hurt))).toEqual([{ label: 'Stress', from: 5, to: 0, rolls: [] }]);
    expect(summary(rest([{ target: HP, does: 'set', to: { field: 'level' } }], { ...hurt, note: { level: 99 } }))[0]!.to).toBe(20);
  });

  it('adds up several rules on one resource into one change', () => {
    const outcome = rest([{ target: HP, does: 'amount', formula: '1d6' }, { target: HP, does: 'amount', formula: '1d4' }], hurt, roller(3, 2));
    expect(summary(outcome)).toEqual([{ label: 'HP', from: 4, to: 9, rolls: ['1d6', '1d4'] }]);
  });
});

describe('spending', () => {
  const state = { resources: { hp: { current: 2, max: 30 }, hitDice: { current: 3, max: 5 } }, note: { con: 2 } };
  const spendRule: RecoveryRule = { target: HP, does: 'spend', from: HIT_DICE, each: '1d8+@con', most: 2 };

  it('offers what the source holds, up to the rule\'s cap', () => {
    expect(restPlan(button([spendRule]), character(state)).rules[0]!.spend).toEqual({ label: 'Hit Dice', max: 2, each: '1d8+(2)' });
    const uncapped = { ...spendRule, most: undefined };
    expect(restPlan(button([uncapped]), character(state)).rules[0]!.spend?.max).toBe(3);
  });

  it('rolls the units spent as one formula and takes them from the source', () => {
    const roll = roller(13);
    const outcome = rest([spendRule], state, roll, { picks: [], spends: new Map([['always:0', 2]]) });
    expect(roll.rolled).toEqual([{ formula: '2d8+4', label: 'Hit Dice (Long rest)' }]);
    expect(summary(outcome)).toEqual([
      { label: 'Hit Dice', from: 3, to: 1, rolls: [] },
      { label: 'HP', from: 2, to: 15, rolls: ['2d8+4'] },
    ]);
  });

  it('never spends past the cap, and spends nothing unasked', () => {
    const roll = roller(4);
    rest([spendRule], state, roll, { picks: [], spends: new Map([['always:0', 9]]) });
    expect(roll.rolled[0]!.formula).toBe('2d8+4');
    expect(rest([spendRule], state).changes).toEqual([]);
  });

  it('spends from a filling source by raising it', () => {
    const stressSpend: RecoveryRule = { target: HP, does: 'spend', from: STRESS, each: '1d4' };
    const outcome = rest([stressSpend], { resources: { hp: { current: 2, max: 30 }, stress: { current: 4, max: 6 } } }, roller(5), { picks: [], spends: new Map([['always:0', 2]]) });
    expect(summary(outcome)[0]).toEqual({ label: 'Stress', from: 4, to: 6, rolls: [] });
    expect(restPlan(button([stressSpend]), character({ resources: { hp: { current: 0, max: 1 }, stress: { current: 4, max: 6 } } })).rules[0]!.spend?.max).toBe(2);
  });

  it('spends uses of counters, from the first row with uses left', () => {
    const fromUses: RecoveryRule = { target: HP, does: 'spend', from: { kind: 'counters', field: 'uses', rows: 'all' }, each: '1d6' };
    const note = { uses: [row('Heal', 1, 1), row('Second wind', 2, 0)] };
    const outcome = rest([fromUses], { resources: { hp: { current: 1, max: 10 } }, note }, roller(4), { picks: [], spends: new Map([['always:0', 1]]) });
    expect(summary(outcome)).toEqual([
      { label: 'Uses Second wind', from: 2, to: 1, rolls: [] },
      { label: 'HP', from: 1, to: 5, rolls: ['1d6'] },
    ]);
  });
});

describe('counters', () => {
  const note = { uses: [row('Wand', 3, 3, 'long'), row('Ki', 4, 2, 'short'), row('Rage', 2, 2)] };
  const counters = (rows: 'all' | string[]) => ({ kind: 'counters', field: 'uses', rows }) as const;

  it('gives back every use of the rows whose reset names one of the rule\'s buttons', () => {
    const outcome = rest([{ target: counters(['long', 'short']), does: 'full' }], { note });
    expect(summary(outcome)).toEqual([
      { label: 'Uses Wand', from: 0, to: 3, rolls: [] },
      { label: 'Uses Ki', from: 2, to: 4, rolls: [] },
    ]);
    expect(own(outcome).counters.get('uses')?.base).toBe(note.uses);
  });

  it('rolls a row\'s own regained formula, and names the row the roll was for', () => {
    const regaining = { uses: [row('Wand', 7, 7, undefined, '1d6+1'), row('Rage', 2, 2)] };
    const roll = roller(3);
    const outcome = rest([{ target: counters('all'), does: 'full' }], { note: regaining }, roll);
    expect(roll.rolled).toEqual([{ formula: '1d6+1', label: 'Wand (Long rest)' }]);
    expect(summary(outcome)).toEqual([
      { label: 'Uses Wand', from: 0, to: 3, rolls: ['1d6+1'] },
      { label: 'Uses Rage', from: 0, to: 2, rolls: [] },
    ]);
  });

  it('gives back an amount, a share, or sets the uses left of each row', () => {
    expect(summary(rest([{ target: counters('all'), does: 'amount', formula: '1' }], { note })).map((change) => change.to)).toEqual([1, 3, 1]);
    expect(summary(rest([{ target: counters('all'), does: 'share', share: 0.5, round: 'up' }], { note })).map((change) => change.to)).toEqual([2, 4, 1]);
    expect(summary(rest([{ target: counters(['long']), does: 'set', to: 2 }], { note }))).toEqual([{ label: 'Uses Wand', from: 0, to: 2, rolls: [] }]);
  });

  it('names a single row by its own name', () => {
    expect(summary(rest([{ target: counters('all'), does: 'full' }], { note: { uses: [row('Wand', 3, 1)] } }))[0]!.label).toBe('Wand');
  });
});

describe('conditions', () => {
  it('steps a valued condition, removing it at 0', () => {
    expect(summary(rest([{ target: EXHAUSTION, does: 'step', by: -1 }], { conditions: { exhaustion: 2 } }))).toEqual([{ label: 'Exhaustion', from: 2, to: 1, rolls: [] }]);
    const gone = rest([{ target: EXHAUSTION, does: 'step', by: -3 }], { conditions: { exhaustion: 2 } });
    expect(own(gone).conditions.get('exhaustion')).toBe(0);
  });

  it('clears a condition, and changes nothing where there is none', () => {
    expect(summary(rest([{ target: EXHAUSTION, does: 'clear' }], { conditions: { exhaustion: 3 } }))[0]!.to).toBe(0);
    expect(rest([{ target: EXHAUSTION, does: 'clear' }], { conditions: {} }).changes).toEqual([]);
  });
});

describe('skipped rules', () => {
  const reasons = (rules: RecoveryRule[], state: CharacterState = {}, roll?: RestRoller) => rest(rules, state, roll).skipped.map(({ index, label, reason }) => ({ index, label, reason: reason.kind }));

  it('skips what the character has no metric or value for, with the reason', () => {
    expect(reasons([
      { target: { kind: 'resource', field: 'mana' }, does: 'full' },
      { target: { kind: 'resource', field: 'ac' }, does: 'full' },
      { target: HP, does: 'full' },
      { target: { kind: 'counters', field: 'level', rows: 'all' }, does: 'full' },
      { target: { kind: 'counters', field: 'slots', rows: 'all' }, does: 'full' },
      { target: { kind: 'condition', id: 'poisoned' }, does: 'clear' },
    ], { note: { slots: 'three' } })).toEqual([
      { index: 0, label: 'mana', reason: 'unknown-resource' },
      { index: 1, label: 'AC', reason: 'static-resource' },
      { index: 2, label: 'HP', reason: 'no-value' },
      { index: 3, label: 'Level', reason: 'unknown-field' },
      { index: 4, label: 'Spell slots', reason: 'unreadable-counters' },
      { index: 5, label: 'Poisoned', reason: 'unknown-condition' },
    ]);
  });

  it('skips a condition while no token of the character is on an open map', () => {
    expect(reasons([{ target: EXHAUSTION, does: 'clear' }], { conditions: null })).toEqual([{ index: 0, label: 'Exhaustion', reason: 'no-token' }]);
  });

  it('skips a formula naming a field the note lacks, and a roll that cannot be made', () => {
    const state = { resources: { hp: { current: 1, max: 9 } } };
    expect(reasons([{ target: HP, does: 'amount', formula: '1d4+@tier' }], state)).toEqual([{ index: 0, label: 'HP', reason: 'formula' }]);
    expect(reasons([{ target: HP, does: 'set', to: { field: 'level' } }], state)).toEqual([{ index: 0, label: 'HP', reason: 'formula' }]);
    expect(reasons([{ target: HP, does: 'amount', formula: '1d4' }], state, () => null)).toEqual([{ index: 0, label: 'HP', reason: 'roll' }]);
  });

  it('applies the rules it can and keeps the skipped in rule order', () => {
    const outcome = rest([{ target: HP, does: 'full' }, { target: STRESS, does: 'full' }], { resources: { stress: { current: 2, max: 3 } } });
    expect(outcome.skipped.map((skip) => skip.index)).toEqual([0]);
    expect(summary(outcome)).toEqual([{ label: 'Stress', from: 2, to: 0, rolls: [] }]);
  });
});
