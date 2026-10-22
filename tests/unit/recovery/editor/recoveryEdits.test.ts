import { describe, expect, it } from 'vitest';
import {
  firstRule, kindFits, newButtonId, ruleFor, ruleOfKind, spendRule, withAddedButton, withButtonMoved,
  withButtonOrder, withoutButton, withoutRule, withRenamedButton, withRows, withRule,
} from '../../../../src/app/recovery/editor/recoveryEdits';
import { MAX_RECOVERY_BUTTONS, MAX_RECOVERY_RULES, type RecoveryButton } from '../../../../src/app/recovery/recoveryTypes';
import { BUTTONS } from '../../../fixtures/recoveryFixtures';

const HP = { kind: 'resource', field: 'hp' } as const;
const DICE = { kind: 'counters', field: 'hit_dice', rows: 'all' } as const;
const EXHAUSTION = { kind: 'condition', id: 'exhaustion' } as const;
const buttons = BUTTONS;

describe('editing a template\'s buttons', () => {
  it('adds a button with an id that stays, up to the limit', () => {
    const id = newButtonId(buttons, () => 0.5);
    expect(buttons.some((button) => button.id === id)).toBe(false);
    expect(withAddedButton(buttons, ' Catch breath ', id)?.at(-1)).toEqual({ id, name: 'Catch breath', rules: [] });
    const full = Array.from({ length: MAX_RECOVERY_BUTTONS }, (_, index): RecoveryButton => ({ id: `b${index}`, name: 'Rest', rules: [] }));
    expect(withAddedButton(full, 'One more', 'x')).toBeNull();
  });

  it('draws a new id where the first one is taken', () => {
    const draws = [0, 0, 0.5];
    const taken = [{ id: newButtonId([], () => 0), name: 'Rest', rules: [] }];
    expect(newButtonId(taken, () => draws.shift()!)).not.toBe(taken[0]!.id);
  });

  it('renames, orders and moves buttons by id', () => {
    expect(withRenamedButton(buttons, 'rest-long01', 'Full rest')[1]!.name).toBe('Full rest');
    expect(withButtonOrder(buttons, ['rest-long01']).map((button) => button.id)).toEqual(['rest-long01', 'rest-short1']);
    expect(withButtonMoved(buttons, 'rest-short1', 5).map((button) => button.id)).toEqual(['rest-long01', 'rest-short1']);
    expect(withButtonMoved(buttons, 'rest-short1', -1).map((button) => button.id)).toEqual(['rest-short1', 'rest-long01']);
  });

  it('removes a button and the rows rules that named it', () => {
    const [left] = withoutButton(buttons, 'rest-short1');
    expect(left!.id).toBe('rest-long01');
    const short = buttons[0]!;
    const kept = withoutButton([short, { ...short, id: 'other' }], 'other')[0]!;
    expect(kept.rules[1]!.target).toEqual({ kind: 'counters', field: 'features', rows: ['rest-short1'] });
    expect(withoutButton([short, { ...short, id: 'other' }], 'rest-short1')[0]!.rules[1]!.target).toEqual({ kind: 'counters', field: 'features', rows: [] });
  });
});

describe('editing a button\'s rules', () => {
  const long = buttons[1]!;

  it('holds one rule per metric, a counters rule whatever its rows', () => {
    expect(ruleFor(long, { ...DICE, rows: ['rest-short1'] })?.does).toBe('share');
    const replaced = withRule(long, { target: HP, does: 'amount', formula: '2d8' })!;
    expect(replaced.rules).toHaveLength(long.rules.length);
    expect(ruleFor(replaced, HP)).toEqual({ target: HP, does: 'amount', formula: '2d8' });
    expect(withoutRule(long, HP).rules.some((rule) => rule.target.kind === 'resource' && rule.target.key === 'hp')).toBe(false);
  });

  it('refuses a rule past the limit, but a metric already held may change', () => {
    const many: RecoveryButton = {
      id: 'many', name: 'Many',
      rules: Array.from({ length: MAX_RECOVERY_RULES }, (_, index) => ({ target: { kind: 'resource', field: `r${index}` }, does: 'full' })),
    };
    expect(withRule(many, { target: HP, does: 'full' })).toBeNull();
    expect(withRule(many, { target: { kind: 'resource', field: 'r0' }, does: 'set', to: 0 })).not.toBeNull();
  });

  it('fits the kinds to the metric: conditions step and clear, the others never do', () => {
    expect(kindFits('step', EXHAUSTION)).toBe(true);
    expect(kindFits('full', EXHAUSTION)).toBe(false);
    expect(kindFits('clear', HP)).toBe(false);
    expect(firstRule(EXHAUSTION)).toEqual({ target: EXHAUSTION, does: 'step', by: -1 });
    expect(firstRule(DICE)).toEqual({ target: DICE, does: 'full' });
  });

  it('changes the kind and keeps what the kinds share', () => {
    const amount = { target: HP, does: 'amount', formula: '1d4', min: 1 } as const;
    expect(ruleOfKind('share', HP, amount)).toEqual({ target: HP, does: 'share', share: 0.5, round: 'down', min: 1 });
    expect(ruleOfKind('amount', HP, { target: HP, does: 'full' })).toEqual({ target: HP, does: 'amount', formula: '1' });
    expect(ruleOfKind('spend', HP, amount)).toBeUndefined();
    expect(ruleOfKind('clear', EXHAUSTION)).toEqual({ target: EXHAUSTION, does: 'clear' });
    expect(ruleOfKind('full', EXHAUSTION)).toBeUndefined();
  });

  it('spends another metric, keeping a Spend rule\'s formula and cap', () => {
    const had = { target: HP, does: 'spend', from: DICE, each: '1d10+@con', most: 2 } as const;
    expect(spendRule(HP, { kind: 'resource', field: 'stress' }, had)).toEqual({ ...had, from: { kind: 'resource', field: 'stress' } });
    expect(spendRule(HP, DICE)).toEqual({ target: HP, does: 'spend', from: DICE, each: '1' });
  });

  it('sets a counters rule\'s rows and leaves other rules alone', () => {
    expect(withRows({ target: DICE, does: 'full' }, ['rest-short1']).target).toEqual({ ...DICE, rows: ['rest-short1'] });
    expect(withRows({ target: HP, does: 'full' }, 'all')).toEqual({ target: HP, does: 'full' });
  });
});
