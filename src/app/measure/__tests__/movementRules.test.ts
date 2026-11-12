import { describe, expect, it } from 'vitest';
import {
  hasMovementRules, isValidMovementRules, movementStepFor, NO_MOVEMENT_RULES, parseMovementRules, sameMovementRules, sameTypedMovementRules,
  savedMovementRules, type MovementRules,
} from '../movementRules';

const MOVE = { name: 'Move', multiple: 1, color: '#22c55e' };
const DASH = { name: 'Dash', multiple: 2, color: '#f59e0b' };
const TWO_STEPS: MovementRules = { steps: [MOVE, DASH], countPerTurn: true };

describe('parseMovementRules', () => {
  it('reads steps and the count switch as they were stored', () => {
    expect(parseMovementRules(structuredClone(TWO_STEPS))).toEqual(TWO_STEPS);
  });

  it('reads anything that is no record as no rules', () => {
    for (const raw of [undefined, null, 'steps', 3, [], [MOVE]]) expect(parseMovementRules(raw)).toBeUndefined();
  });

  it('reads rules without steps as rules: a collection that removed its system\'s steps', () => {
    expect(parseMovementRules({})).toEqual({ steps: [], countPerTurn: false });
    expect(parseMovementRules({ steps: 'none', countPerTurn: 'yes' })).toEqual({ steps: [], countPerTurn: false });
    expect(parseMovementRules({ steps: [], countPerTurn: true })).toEqual({ steps: [], countPerTurn: true });
  });

  it('drops a step without a name, a multiple above 0 or a colour', () => {
    const steps = [
      { name: '  ', multiple: 1, color: '#22c55e' },
      { name: 'Crawl', multiple: 0, color: '#22c55e' },
      { name: 'Crawl', multiple: -1, color: '#22c55e' },
      { name: 'Crawl', multiple: '1', color: '#22c55e' },
      { name: 'Crawl', multiple: NaN, color: '#22c55e' },
      { name: 'Crawl', multiple: Infinity, color: '#22c55e' },
      { name: 'Crawl', multiple: 1, color: 'green' },
      { name: 7, multiple: 1, color: '#22c55e' },
      null,
      'Move',
      { ...MOVE, name: ' Move ' },
    ];
    expect(parseMovementRules({ steps })).toEqual({ steps: [MOVE], countPerTurn: false });
  });

  it('keeps only steps that reach farther than the one before, and four at most', () => {
    const step = (multiple: number): object => ({ name: `x${multiple}`, multiple, color: '#3b82f6' });
    expect(parseMovementRules({ steps: [step(2), step(1), step(2), step(3)] })?.steps.map((kept) => kept.multiple)).toEqual([2, 3]);
    expect(parseMovementRules({ steps: [1, 2, 3, 4, 5, 6].map(step) })?.steps.map((kept) => kept.multiple)).toEqual([1, 2, 3, 4]);
  });

  it('cuts a name that is too long', () => {
    expect(parseMovementRules({ steps: [{ ...MOVE, name: 'A'.repeat(60) }] })?.steps[0]?.name).toHaveLength(24);
  });
});

describe('movement rules while they are edited', () => {
  it('can be saved once every step has a name and a multiple above the step before', () => {
    expect(isValidMovementRules(TWO_STEPS)).toBe(true);
    expect(isValidMovementRules(NO_MOVEMENT_RULES)).toBe(true);
    expect(isValidMovementRules({ ...TWO_STEPS, steps: [MOVE, { ...DASH, name: ' ' }] })).toBe(false);
    expect(isValidMovementRules({ ...TWO_STEPS, steps: [MOVE, { ...DASH, multiple: 1 }] })).toBe(false);
    expect(isValidMovementRules({ ...TWO_STEPS, steps: [{ ...MOVE, multiple: NaN }] })).toBe(false);
    expect(isValidMovementRules({ ...TWO_STEPS, steps: [{ ...MOVE, color: 'red' }] })).toBe(false);
    expect(isValidMovementRules({ ...TWO_STEPS, steps: [1, 2, 3, 4, 5].map((multiple) => ({ ...MOVE, multiple })) })).toBe(false);
  });

  it('are stored with their names trimmed, and read back the same', () => {
    const saved = savedMovementRules({ steps: [{ ...MOVE, name: ' Move ' }, DASH], countPerTurn: true });
    expect(saved).toEqual(TWO_STEPS);
    expect(parseMovementRules(saved)).toEqual(saved);
  });

  it('do something once they name a step or count per turn', () => {
    expect(hasMovementRules(undefined)).toBe(false);
    expect(hasMovementRules({ steps: [], countPerTurn: false })).toBe(false);
    expect(hasMovementRules({ steps: [], countPerTurn: true })).toBe(true);
    expect(hasMovementRules({ steps: [MOVE], countPerTurn: false })).toBe(true);
  });
});

describe('sameMovementRules', () => {
  it('reads no rules as rules without steps that count nothing', () => {
    expect(sameMovementRules(undefined, undefined)).toBe(true);
    expect(sameMovementRules(undefined, { steps: [], countPerTurn: false })).toBe(true);
    expect(sameMovementRules(undefined, { steps: [], countPerTurn: true })).toBe(false);
    expect(sameMovementRules(undefined, TWO_STEPS)).toBe(false);
  });

  it('tells rules apart by any step\'s name, multiple or colour, by their order and by the count switch', () => {
    expect(sameMovementRules(TWO_STEPS, structuredClone(TWO_STEPS))).toBe(true);
    expect(sameMovementRules(TWO_STEPS, { ...TWO_STEPS, countPerTurn: false })).toBe(false);
    expect(sameMovementRules(TWO_STEPS, { ...TWO_STEPS, steps: [MOVE] })).toBe(false);
    expect(sameMovementRules(TWO_STEPS, { ...TWO_STEPS, steps: [MOVE, { ...DASH, name: 'Run' }] })).toBe(false);
    expect(sameMovementRules(TWO_STEPS, { ...TWO_STEPS, steps: [MOVE, { ...DASH, multiple: 3 }] })).toBe(false);
    expect(sameMovementRules(TWO_STEPS, { ...TWO_STEPS, steps: [MOVE, { ...DASH, color: '#f97316' }] })).toBe(false);
  });

  it('ignores a colour\'s case and spaces around a name, which typing does not', () => {
    const typed: MovementRules = { ...TWO_STEPS, steps: [{ ...MOVE, name: 'Move ', color: '#22C55E' }, DASH] };
    expect(sameMovementRules(TWO_STEPS, typed)).toBe(true);
    expect(sameTypedMovementRules(typed, TWO_STEPS)).toBe(false);
    expect(sameTypedMovementRules(structuredClone(TWO_STEPS), TWO_STEPS)).toBe(true);
    // A number field emptied while typing is no number, twice over.
    const emptied: MovementRules = { ...TWO_STEPS, steps: [{ ...MOVE, multiple: NaN }] };
    expect(sameTypedMovementRules(emptied, structuredClone(emptied))).toBe(true);
  });
});

describe('movementStepFor', () => {
  it('names the first step that reaches as far, its end included', () => {
    expect(movementStepFor(0, 30, TWO_STEPS)).toBe(MOVE);
    expect(movementStepFor(25, 30, TWO_STEPS)).toBe(MOVE);
    expect(movementStepFor(30, 30, TWO_STEPS)).toBe(MOVE);
    expect(movementStepFor(35, 30, TWO_STEPS)).toBe(DASH);
    expect(movementStepFor(60, 30, TWO_STEPS)).toBe(DASH);
  });

  it('is beyond the last step past its end', () => {
    expect(movementStepFor(60.5, 30, TWO_STEPS)).toBe('beyond');
    expect(movementStepFor(1e9, 30, TWO_STEPS)).toBe('beyond');
  });

  it('takes a distance that misses a step\'s end by a rounding error as that end', () => {
    // Three 1.5 m squares at a speed of 4.5 m: 1.5 * 3 is 4.5 only to the last bit but one.
    expect(movementStepFor(0.1 + 0.2, 0.3, TWO_STEPS)).toBe(MOVE);
    expect(movementStepFor(9 * 1.1, 9.9, TWO_STEPS)).toBe(MOVE);
  });

  it('counts half steps and steps that do not start at one move', () => {
    const rules: MovementRules = { steps: [{ ...MOVE, multiple: 0.5 }, { ...DASH, multiple: 1.5 }], countPerTurn: false };
    expect(movementStepFor(15, 30, rules)).toBe(rules.steps[0]);
    expect(movementStepFor(16, 30, rules)).toBe(rules.steps[1]);
    expect(movementStepFor(46, 30, rules)).toBe('beyond');
  });

  it('tells no step without steps, without a speed, or for a distance that is no number', () => {
    expect(movementStepFor(10, 30, NO_MOVEMENT_RULES)).toBeNull();
    expect(movementStepFor(10, 30, undefined)).toBeNull();
    for (const speed of [null, undefined, 0, -30, NaN, Infinity]) expect(movementStepFor(10, speed, TWO_STEPS)).toBeNull();
    expect(movementStepFor(NaN, 30, TWO_STEPS)).toBeNull();
    expect(movementStepFor(-5, 30, TWO_STEPS)).toBe(MOVE);
  });
});
