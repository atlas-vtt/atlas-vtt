import { describe, expect, it } from 'vitest';
import { formulaReads, withFieldReference } from '../../../../src/app/recovery/editor/recoveryFormulas';
import { ruleBadge } from '../../../../src/app/recovery/editor/ruleBadge';

const HP = { kind: 'resource', field: 'hp' } as const;
const DICE = { kind: 'counters', field: 'hit_dice', rows: 'all' } as const;

describe('formulas', () => {
  it('read with their fields as numbers', () => {
    expect(formulaReads('1d4+@tier')).toBe(true);
    expect(formulaReads('@level')).toBe(true);
    // A field as a dice count, as the rest reads it
    expect(formulaReads('@level d6')).toBe(true);
    expect(formulaReads('1d4+')).toBe(false);
    expect(formulaReads('  ')).toBe(false);
  });

  it('take a field at the caret, joined with a plus', () => {
    expect(withFieldReference('1d8', 'con')).toEqual({ text: '1d8+@con', caret: 8 });
    expect(withFieldReference('1d8+', 'con')).toEqual({ text: '1d8+@con', caret: 8 });
    // A reference being typed is the one picked
    expect(withFieldReference('1+@ar', 'armor')).toEqual({ text: '1+@armor', caret: 8 });
    expect(withFieldReference('1+@', 'armor')).toEqual({ text: '1+@armor', caret: 8 });
    expect(withFieldReference('@ar+2', 'armor', 3)).toEqual({ text: '@armor+2', caret: 6 });
    expect(withFieldReference('1+@armxx+2', 'armor', 6)).toEqual({ text: '1+@armor+2', caret: 8 });
    expect(withFieldReference('', 'level')).toEqual({ text: '@level', caret: 6 });
    expect(withFieldReference('1d8 2', 'con', 3).text).toBe('1d8+@con+2');
  });
});

describe('badges', () => {
  const nameOf = (): string => 'Hit Dice';
  it('say each rule in a word or a formula', () => {
    expect(ruleBadge({ target: HP, does: 'full' }, nameOf)).toBe('Full');
    expect(ruleBadge({ target: HP, does: 'amount', formula: '1d4 + @tier' }, nameOf)).toBe('+1d4+@tier');
    expect(ruleBadge({ target: DICE, does: 'share', share: 0.5, round: 'down' }, nameOf)).toBe('½');
    expect(ruleBadge({ target: HP, does: 'set', to: 0 }, nameOf)).toBe('→ 0');
    expect(ruleBadge({ target: HP, does: 'set', to: { field: 'level' } }, nameOf)).toBe('→ @level');
    expect(ruleBadge({ target: HP, does: 'spend', from: DICE, each: '1d8' }, nameOf)).toBe('From Hit Dice');
    expect(ruleBadge({ target: { kind: 'condition', id: 'x' }, does: 'step', by: -1 }, nameOf)).toBe('−1');
    expect(ruleBadge({ target: { kind: 'condition', id: 'x' }, does: 'clear' }, nameOf)).toBe('Clear');
  });
});
