import { describe, expect, it } from 'vitest';
import {
  hasMovementRules, isValidMovementRules, MAX_MOVEMENT_SPEED, movementStepFor, NO_MOVEMENT_RULES, parseMovementRules, sameMovementRules,
  sameTypedMovementRules, savedMovementRules, shownStepMultiple, stepReach, typedStepMultiple, withMovementSpeed, type MovementRules,
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

  it('reads the speed of creatures that state none only where it is a number above 0 within bounds', () => {
    expect(parseMovementRules({ ...TWO_STEPS, speed: 30 })).toEqual({ ...TWO_STEPS, speed: 30 });
    expect(parseMovementRules({ speed: 7.5 })).toEqual({ steps: [], countPerTurn: false, speed: 7.5 });
    expect(parseMovementRules({ speed: MAX_MOVEMENT_SPEED })?.speed).toBe(MAX_MOVEMENT_SPEED);
    for (const speed of [0, -30, NaN, Infinity, MAX_MOVEMENT_SPEED + 1, '30', null, true, [30], { feet: 30 }]) {
      expect(parseMovementRules({ ...TWO_STEPS, speed }), String(speed)).toEqual(TWO_STEPS);
    }
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

  it('can be saved with a speed only where it is one, and are stored with it', () => {
    expect(isValidMovementRules({ ...TWO_STEPS, speed: 30 })).toBe(true);
    for (const speed of [0, -5, NaN, MAX_MOVEMENT_SPEED + 1]) expect(isValidMovementRules({ ...TWO_STEPS, speed }), String(speed)).toBe(false);
    expect(savedMovementRules({ ...TWO_STEPS, speed: 30 })).toEqual({ ...TWO_STEPS, speed: 30 });
    expect(savedMovementRules({ ...TWO_STEPS, speed: 0 })).toEqual(TWO_STEPS);
    expect(withMovementSpeed(TWO_STEPS, 25)).toEqual({ ...TWO_STEPS, speed: 25 });
    expect(withMovementSpeed({ ...TWO_STEPS, speed: 25 }, undefined)).toEqual(TWO_STEPS);
    expect(withMovementSpeed({ ...TWO_STEPS, speed: 25 }, undefined)).not.toHaveProperty('speed');
  });

  it('do something once they name a step or a speed, or count per turn', () => {
    expect(hasMovementRules(undefined)).toBe(false);
    expect(hasMovementRules({ steps: [], countPerTurn: false })).toBe(false);
    expect(hasMovementRules({ steps: [], countPerTurn: false, speed: 30 })).toBe(true);
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

  it('tells rules apart by the speed of creatures that state none', () => {
    expect(sameMovementRules({ ...TWO_STEPS, speed: 30 }, { ...TWO_STEPS, speed: 30 })).toBe(true);
    expect(sameMovementRules({ ...TWO_STEPS, speed: 30 }, TWO_STEPS)).toBe(false);
    expect(sameMovementRules({ ...TWO_STEPS, speed: 30 }, { ...TWO_STEPS, speed: 25 })).toBe(false);
    expect(sameMovementRules(undefined, { steps: [], countPerTurn: false, speed: 30 })).toBe(false);
    expect(sameTypedMovementRules({ ...TWO_STEPS, speed: 30 }, { ...TWO_STEPS, speed: 30 })).toBe(true);
    expect(sameTypedMovementRules({ ...TWO_STEPS, speed: 3 }, { ...TWO_STEPS, speed: 30 })).toBe(false);
    expect(sameTypedMovementRules(TWO_STEPS, { ...TWO_STEPS, speed: 30 })).toBe(false);
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

describe('stepReach', () => {
  it('is the step\'s multiple of the speed, and the last step\'s beyond them all', () => {
    expect(stepReach(MOVE, 30, TWO_STEPS)).toBe(30);
    expect(stepReach(DASH, 30, TWO_STEPS)).toBe(60);
    expect(stepReach('beyond', 30, TWO_STEPS)).toBe(60);
    expect(stepReach(null, 30, TWO_STEPS)).toBeNull();
    expect(stepReach('beyond', 30, NO_MOVEMENT_RULES)).toBeNull();
  });
});

describe('a step\'s multiple as it is typed', () => {
  it('reads a number as typed, and no number for an empty field', () => {
    for (const [text, multiple] of [['1', 1], ['2', 2], ['0.5', 0.5], ['1.5', 1.5], ['0.25', 0.25], ['0.3', 0.3], ['0.35', 0.35], [' 4 ', 4]] as const) {
      expect(typedStepMultiple(text), text).toBe(multiple);
    }
    for (const text of ['', '  ', 'x']) expect(typedStepMultiple(text), text).toBeNaN();
  });

  it('reads the decimals of a third as that third, which then holds a move of exactly a third', () => {
    for (const text of ['0.33', '0.333', '0.3333']) expect(typedStepMultiple(text), text).toBe(1 / 3);
    for (const text of ['0.66', '0.67', '0.667']) expect(typedStepMultiple(text), text).toBe(2 / 3);
    expect(typedStepMultiple('1.33')).toBe(4 / 3);
    const third: MovementRules = { steps: [{ ...MOVE, multiple: typedStepMultiple('0.33') }, { ...DASH, multiple: 1 }], countPerTurn: false };
    for (const speed of [30, 60, 90, 120, 150, 180, 240]) expect(movementStepFor(speed / 3, speed, third), String(speed)).toBe(third.steps[0]);
    expect(movementStepFor(45, 120, third)).toBe(third.steps[1]);
  });

  it('shows three decimals at most, and reads what it shows as the same multiple', () => {
    expect(shownStepMultiple(1 / 3)).toBe(0.333);
    expect(shownStepMultiple(2)).toBe(2);
    expect(shownStepMultiple(1.5)).toBe(1.5);
    for (const multiple of [1 / 3, 2 / 3, 4 / 3, 0.5, 1, 2.5]) expect(typedStepMultiple(String(shownStepMultiple(multiple)))).toBe(multiple);
  });
});
