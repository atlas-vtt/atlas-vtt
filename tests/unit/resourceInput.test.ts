import { describe, expect, it } from 'vitest';
import { applyResourceInput, parseResourceInput } from '../../src/app/resources/resourceInput';

describe('a typed resource value', () => {
  const hp = { current: 12, max: 30 };

  it('sets the current value from a plain number', () => {
    expect(applyResourceInput('15', hp)).toEqual({ current: 15, max: 30 });
    expect(applyResourceInput(' 0 ', hp)).toEqual({ current: 0, max: 30 });
  });

  it('edits the maximum on its own', () => {
    expect(applyResourceInput('40', hp, 'max')).toEqual({ current: 12, max: 40 });
    expect(applyResourceInput('5', hp, 'max')).toEqual({ current: 5, max: 5 });
    expect(applyResourceInput('+10', hp, 'max')).toEqual({ current: 12, max: 40 });
    expect(applyResourceInput('0', hp, 'max')).toBeNull();
    expect(applyResourceInput('-99', hp, 'max')).toBeNull();
  });

  it('applies a signed change', () => {
    expect(applyResourceInput('+5', hp)).toEqual({ current: 17, max: 30 });
    expect(applyResourceInput('-3', hp)).toEqual({ current: 9, max: 30 });
    expect(applyResourceInput('−3', hp)).toEqual({ current: 9, max: 30 });
  });

  it('works out a change of several numbers (issues #495, #396)', () => {
    expect(applyResourceInput('-10-5', { current: 30, max: 30 })).toEqual({ current: 15, max: 30 });
    expect(applyResourceInput('-5-3-4-3', { current: 30, max: 30 })).toEqual({ current: 15, max: 30 });
    expect(applyResourceInput('-9*2', { current: 30, max: 30 })).toEqual({ current: 12, max: 30 });
    expect(applyResourceInput('-10+3', { current: 30, max: 30 })).toEqual({ current: 23, max: 30 });
    expect(applyResourceInput('+2+3', hp)).toEqual({ current: 17, max: 30 });
    expect(applyResourceInput('-(4+5)/2', { current: 30, max: 30 })).toEqual({ current: 26, max: 30 });
    expect(applyResourceInput('- 10 - 5', { current: 30, max: 30 })).toEqual({ current: 15, max: 30 });
    expect(applyResourceInput('-9×2', { current: 30, max: 30 })).toEqual({ current: 12, max: 30 });
  });

  it('rounds halved damage down: 9 damage halved takes 4', () => {
    expect(applyResourceInput('-9/2', { current: 30, max: 30 })).toEqual({ current: 26, max: 30 });
    expect(applyResourceInput('-9÷2', { current: 30, max: 30 })).toEqual({ current: 26, max: 30 });
    expect(applyResourceInput('+7/2', hp)).toEqual({ current: 15, max: 30 });
    expect(applyResourceInput('-1/2', hp)).toEqual({ current: 12, max: 30 });
    expect(parseResourceInput('-1/2')).toEqual({ relative: true, amount: 0 });
  });

  it('clamps the current value to 0..max', () => {
    expect(applyResourceInput('-99', hp)).toEqual({ current: 0, max: 30 });
    expect(applyResourceInput('99', hp)).toEqual({ current: 30, max: 30 });
    expect(applyResourceInput('-20-20', hp)).toEqual({ current: 0, max: 30 });
  });

  it('never rolls dice and refuses what is no number', () => {
    for (const raw of ['abc', '', '+', '-', '5/0', '-5/0', '15/40', '12+3', '-2d6', '+1d4', '-d20', '--3', '-3-', '*3', '1e3', '2.5', '-2.5']) {
      expect(applyResourceInput(raw, hp), raw).toBeNull();
    }
  });

  it('takes a change of one number however large, as before sums were read', () => {
    expect(applyResourceInput('-12000', { current: 50000, max: 50000 })).toEqual({ current: 38000, max: 50000 });
    expect(applyResourceInput('+15000', { current: 0, max: 50000 })).toEqual({ current: 15000, max: 50000 });
    expect(parseResourceInput('-0')).toEqual({ relative: true, amount: 0 });
    expect(parseResourceInput('+99999999999999999999')).toBeNull();
  });

  it('reads a number to set apart from an amount to add', () => {
    expect(parseResourceInput('12')).toEqual({ relative: false, value: 12 });
    expect(parseResourceInput('-12')).toEqual({ relative: true, amount: -12 });
    expect(parseResourceInput('+0')).toEqual({ relative: true, amount: 0 });
  });
});
