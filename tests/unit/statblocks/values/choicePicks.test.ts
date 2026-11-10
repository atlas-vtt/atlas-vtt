import { describe, expect, it } from 'vitest';
import { choiceText, optionsLeft, picksChoice, readChoice, type ChoiceShape } from '../../../../src/app/statblocks/values/choicePicks';
import { coerce } from '../../../../src/app/statblocks/values/valueCoercion';
import { valueMisfit } from '../../../../src/app/statblocks/values/valueFit';
import { sampleValueFor } from '../../../../src/app/statblocks/model/sampleValues';

const SENSES: ChoiceShape = { options: ['darkvision', 'blindsight', 'tremorsense', 'passive Perception'], several: true, numbered: true, unit: 'ft.' };
const LANGUAGES: ChoiceShape = { options: ['Common', 'Elvish', 'Deep Speech'], several: true };
const MOVEMENT: ChoiceShape = { options: ['walk', 'fly', 'fly (hover)'], numbered: true, unit: 'ft.' };

describe('choice picks', () => {
  it('reads a line as picks with their numbers, and writes it back unchanged', () => {
    const line = 'darkvision 60 ft., blindsight 10 ft., passive Perception 12';
    const read = readChoice(SENSES, line);
    expect(read).toEqual({
      picks: [
        { option: 'darkvision', number: 60, unit: 'ft.' },
        { option: 'blindsight', number: 10, unit: 'ft.' },
        { option: 'passive Perception', number: 12, unit: '' },
      ],
      unread: [],
    });
    expect(choiceText(SENSES, read)).toBe(line);
  });

  it('matches options in any case, writes them as the template spells them, in the template\'s order', () => {
    const read = readChoice(SENSES, 'Blindsight 30 ft., DARKVISION 120 ft.');
    expect(choiceText(SENSES, read)).toBe('darkvision 120 ft., blindsight 30 ft.');
    expect(choiceText(LANGUAGES, readChoice(LANGUAGES, 'deep speech, common'))).toBe('Common, Deep Speech');
  });

  it('keeps what names no option as it is written, after the picks', () => {
    const read = readChoice(SENSES, 'truesight 5 miles, darkvision 60 ft.');
    expect(read.unread).toEqual(['truesight 5 miles']);
    expect(choiceText(SENSES, read)).toBe('darkvision 60 ft., truesight 5 miles');
  });

  it('takes the longest option a part starts with', () => {
    expect(readChoice(MOVEMENT, 'fly (hover) 60 ft.').picks).toEqual([{ option: 'fly (hover)', number: 60, unit: 'ft.' }]);
  });

  it('reads a list or a record of options and numbers as stored by other tools', () => {
    expect(choiceText(LANGUAGES, readChoice(LANGUAGES, ['Elvish', 'Common']))).toBe('Common, Elvish');
    expect(choiceText(SENSES, readChoice(SENSES, { darkvision: 60 }))).toBe('darkvision 60');
  });

  it('reads a field that takes one option as one part, commas and all', () => {
    expect(readChoice({ options: ['Small, swarm of Tiny'] }, 'Small, swarm of Tiny').picks).toHaveLength(1);
  });

  it('offers only the options not picked yet where several are taken', () => {
    expect(optionsLeft(LANGUAGES, readChoice(LANGUAGES, 'Elvish').picks)).toEqual(['Common', 'Deep Speech']);
    expect(optionsLeft(MOVEMENT, readChoice(MOVEMENT, 'fly 30 ft.').picks)).toEqual(['walk', 'fly', 'fly (hover)']);
  });

  it('takes open fields\' own options, with their numbers', () => {
    const open: ChoiceShape = { ...SENSES, open: true };
    expect(readChoice(open, 'echolocation 30 ft.').picks).toEqual([{ option: 'echolocation', number: 30, unit: 'ft.' }]);
  });

  it('is edited as picks only where it takes several or a number', () => {
    expect(picksChoice({ type: 'choice', several: true })).toBe(true);
    expect(picksChoice({ type: 'choice', numbered: true })).toBe(true);
    expect(picksChoice({ type: 'choice' })).toBe(false);
    expect(picksChoice({ type: 'list', several: true })).toBe(false);
  });
});

describe('typed picks', () => {
  it('are written as the field writes them', () => {
    expect(coerce('choice', 'blindsight 10 ft., Darkvision 60 ft.', SENSES)).toEqual({ ok: true, value: 'darkvision 60 ft., blindsight 10 ft.' });
    expect(coerce('choice', 'elvish, common', LANGUAGES)).toEqual({ ok: true, value: 'Common, Elvish' });
  });

  it('are refused where a part names no option, saying what it takes', () => {
    expect(coerce('choice', 'darkvision 60 ft., truesight 5 miles', SENSES)).toEqual({
      ok: false, raw: 'darkvision 60 ft., truesight 5 miles', problem: '“truesight 5 miles” isn\'t one of darkvision, blindsight, tremorsense, passive Perception, with a number in ft.',
    });
    expect(coerce('choice', 'Common, Sylvan', LANGUAGES)).toMatchObject({ ok: false, problem: '“Sylvan” isn\'t one of Common, Elvish, Deep Speech.' });
  });

  it('flag a stored value with a part outside the options, and a list of options fits', () => {
    expect(valueMisfit({ type: 'choice', ...LANGUAGES }, ['Common', 'Elvish'])).toBeNull();
    expect(valueMisfit({ type: 'choice', ...LANGUAGES }, ['Common', 'Sylvan'])?.label).toBe('Not an option');
    expect(valueMisfit({ type: 'choice', ...SENSES }, 'darkvision 60 ft.')).toBeNull();
  });
});

describe('a sample of picks', () => {
  it('shows two options with numbers, or one where only one is taken', () => {
    expect(sampleValueFor({ key: 'senses', label: 'Senses', type: 'choice', ...SENSES })).toBe('darkvision 60 ft., blindsight 30 ft.');
    expect(sampleValueFor({ key: 'speed', label: 'Speed', type: 'choice', ...MOVEMENT })).toBe('walk 60 ft.');
    expect(sampleValueFor({ key: 'languages', label: 'Languages', type: 'choice', ...LANGUAGES })).toBe('Common, Elvish');
  });
});
