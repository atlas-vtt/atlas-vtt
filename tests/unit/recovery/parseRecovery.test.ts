import { describe, expect, it } from 'vitest';
import { parseRecoveryButton, parseRecoveryButtons, parseRecoveryRule } from '../../../src/app/recovery/parseRecovery';
import { MAX_RECOVERY_BUTTONS, MAX_RECOVERY_RULES, type RecoveryButton, type RecoveryRule } from '../../../src/app/recovery/recoveryTypes';

const HP = { kind: 'resource', field: 'hp' } as const;
const SLOTS = { kind: 'counters', field: 'slots', rows: ['short', 'long'] } as const;
const EXHAUSTION = { kind: 'condition', id: 'exhaustion' } as const;

const longRest: RecoveryButton = {
  id: 'long',
  name: 'Long rest',
  rules: [
    { target: HP, does: 'full' },
    { target: { kind: 'counters', field: 'slots', rows: 'all' }, does: 'full' },
    { target: HP, does: 'amount', formula: '1d4+@tier', min: 1 },
    { target: SLOTS, does: 'share', share: 0.5, round: 'up', min: 1 },
    { target: { kind: 'resource', field: 'stress' }, does: 'set', to: 0 },
    { target: HP, does: 'set', to: { field: 'level' } },
    { target: HP, does: 'spend', from: { kind: 'counters', field: 'hit-dice', rows: 'all' }, each: '1d8+@abilities.con', most: 3 },
    { target: EXHAUSTION, does: 'step', by: -1 },
    { target: EXHAUSTION, does: 'clear' },
  ],
};

describe('parseRecoveryRule', () => {
  it('reads every kind of rule as it is written', () => {
    for (const rule of longRest.rules) expect(parseRecoveryRule(structuredClone(rule))).toEqual(rule);
  });

  it('trims a formula and leaves out an optional part that is absent', () => {
    expect(parseRecoveryRule({ target: HP, does: 'amount', formula: '  @level ' })).toEqual({ target: HP, does: 'amount', formula: '@level' });
    expect(parseRecoveryRule({ target: HP, does: 'spend', from: HP, each: '1d8' })).toEqual({ target: HP, does: 'spend', from: HP, each: '1d8' });
  });

  it('leaves out a rule whose target does not take it', () => {
    expect(parseRecoveryRule({ target: EXHAUSTION, does: 'full' })).toBeUndefined();
    expect(parseRecoveryRule({ target: EXHAUSTION, does: 'amount', formula: '1' })).toBeUndefined();
    expect(parseRecoveryRule({ target: HP, does: 'step', by: -1 })).toBeUndefined();
    expect(parseRecoveryRule({ target: SLOTS, does: 'clear' })).toBeUndefined();
    expect(parseRecoveryRule({ target: HP, does: 'spend', from: EXHAUSTION, each: '1' })).toBeUndefined();
  });

  it('never guesses at a part it cannot read', () => {
    const unreadable: unknown[] = [
      null, 'full', [],
      { target: HP },
      { target: HP, does: 'heal' },
      { target: { kind: 'resource' }, does: 'full' },
      { target: { kind: 'resource', field: '  ' }, does: 'full' },
      { target: { kind: 'counters', field: 'slots' }, does: 'full' },
      { target: { kind: 'counters', field: 'slots', rows: ['long', 3] }, does: 'full' },
      { target: { kind: 'counters', field: 'slots', rows: 'some' }, does: 'full' },
      { target: { kind: 'counters', field: 'slots', rows: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] }, does: 'full' },
      { target: { kind: 'token', key: 'hp' }, does: 'full' },
      { target: HP, does: 'amount' },
      { target: HP, does: 'amount', formula: '' },
      { target: HP, does: 'amount', formula: 'd'.repeat(101) },
      { target: HP, does: 'amount', formula: '1d4', min: -1 },
      { target: HP, does: 'amount', formula: '1d4', min: 1.5 },
      { target: HP, does: 'amount', formula: '1d4', min: '1' },
      { target: HP, does: 'share', share: 0.3, round: 'down' },
      { target: HP, does: 'share', share: 0.5, round: 'nearest' },
      { target: HP, does: 'set', to: -2 },
      { target: HP, does: 'set', to: '0' },
      { target: HP, does: 'set', to: { field: '' } },
      { target: HP, does: 'spend', from: HP, each: '1d8', most: 0 },
      { target: EXHAUSTION, does: 'step', by: 0 },
      { target: EXHAUSTION, does: 'step', by: 0.5 },
      { target: EXHAUSTION, does: 'step' },
      { target: { kind: 'condition', id: '' }, does: 'clear' },
    ];
    for (const raw of unreadable) expect(parseRecoveryRule(raw), JSON.stringify(raw)).toBeUndefined();
  });

  it('reads each row id once', () => {
    const rule = parseRecoveryRule({ target: { kind: 'counters', field: 'slots', rows: ['long', 'long', 'short'] }, does: 'full' });
    expect(rule?.target).toEqual({ kind: 'counters', field: 'slots', rows: ['long', 'short'] });
  });

  it('reads only what the object itself holds', () => {
    const inherited = Object.create({ does: 'full' }) as Record<string, unknown>;
    inherited.target = HP;
    expect(parseRecoveryRule(inherited)).toBeUndefined();
  });
});

describe('parseRecoveryButton', () => {
  it('reads a button with the rules it can read, and trims its name', () => {
    const raw = { id: 'long', name: ' Long rest ', rules: [{ target: HP, does: 'full' }, { target: HP, does: 'heal' }] };
    expect(parseRecoveryButton(raw)).toEqual({ id: 'long', name: 'Long rest', rules: [{ target: HP, does: 'full' }] });
  });

  it('keeps a button without rules, as one just made has none', () => {
    expect(parseRecoveryButton({ id: 'short', name: 'Short rest', rules: [] })).toEqual({ id: 'short', name: 'Short rest', rules: [] });
  });

  it('leaves out a button without an id, a name or a list of rules', () => {
    expect(parseRecoveryButton({ name: 'Long rest', rules: [] })).toBeUndefined();
    expect(parseRecoveryButton({ id: '', name: 'Long rest', rules: [] })).toBeUndefined();
    expect(parseRecoveryButton({ id: 'long', name: ' ', rules: [] })).toBeUndefined();
    expect(parseRecoveryButton({ id: 'long', name: 'Long rest' })).toBeUndefined();
    expect(parseRecoveryButton({ id: 7, name: 'Long rest', rules: [] })).toBeUndefined();
  });

  it(`keeps the first ${MAX_RECOVERY_RULES} rules`, () => {
    const rules: RecoveryRule[] = Array.from({ length: MAX_RECOVERY_RULES + 4 }, (_, i) => ({ target: { kind: 'resource', field: `r${i}` }, does: 'full' }));
    expect(parseRecoveryButton({ id: 'long', name: 'Long rest', rules })?.rules).toEqual(rules.slice(0, MAX_RECOVERY_RULES));
  });
});

describe('parseRecoveryButtons', () => {
  it(`keeps the first of each id, the first ${MAX_RECOVERY_BUTTONS} buttons`, () => {
    const buttons = Array.from({ length: MAX_RECOVERY_BUTTONS + 2 }, (_, i) => ({ id: `b${i}`, name: `Button ${i}`, rules: [] }));
    const read = parseRecoveryButtons([{ id: 'b0', name: 'Second b0', rules: [] }, ...buttons]);
    expect(read.map((button) => button.name)).toEqual(['Second b0', ...buttons.slice(1, MAX_RECOVERY_BUTTONS).map((button) => button.name)]);
    expect(parseRecoveryButtons('long')).toEqual([]);
  });
});

