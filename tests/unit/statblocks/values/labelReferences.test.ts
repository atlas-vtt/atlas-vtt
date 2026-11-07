import { describe, expect, it } from 'vitest';
import { splitDiceSegments } from '../../../../src/app/services/statblockDiceText';
import type { StatblockTemplate, TemplateField } from '../../../../src/app/statblocks/model/templateTypes';
import { withReferencesFilled } from '../../../../src/app/statblocks/values/fillReferences';
import { statblockLookup } from '../../../../src/app/statblocks/values/statblockLookup';
import { templateOf } from '../render/sheetTestKit';

// The traits of a Daggerheart character: a Metric over fields whose labels are short names
const FIELDS: TemplateField[] = [
  { key: 'name', label: 'Name', type: 'text' },
  { key: 'agility', label: 'Agi', type: 'number' },
  { key: 'strength', label: 'Str', type: 'number' },
  { key: 'hope_max', label: 'Max. Hope', type: 'number' },
  { key: 'experiences', label: 'Experiences', type: 'pairs' },
  { key: 'background', label: 'Background', type: 'markdown' },
];
const TEMPLATE: StatblockTemplate = templateOf(FIELDS, [
  { id: 'traits01', type: 'metric', fields: ['agility', 'strength'] },
  { id: 'back0001', type: 'text', field: 'background' },
]);
const NOTE = {
  name: 'Kestrel Vane', agility: 1, strength: 2, hope_max: 6,
  experiences: { 'Never backs down': 2, 'Test Experience 3': '+4+@agi' },
  background: 'It feels pretty good 2d8+@str',
};

describe('a reference by a field\'s label', () => {
  const lookup = statblockLookup(TEMPLATE, NOTE);

  it('reads the field whose label it names, in any case and without punctuation', () => {
    expect(lookup('str')).toBe(2);
    expect(lookup('agi')).toBe(1);
    expect(lookup('AGI')).toBe(1);
    expect(lookup('maxhope')).toBe(6);
    expect(lookup('strength')).toBe(2);
  });

  it('adds no row a plain number does not have', () => {
    expect(lookup('str.mod')).toBeUndefined();
  });

  it('reads nothing for a label two fields share', () => {
    const fields: TemplateField[] = [...FIELDS, { key: 'stress', label: 'Str', type: 'number' }];
    expect(statblockLookup({ ...TEMPLATE, fields }, { ...NOTE, stress: 4 })('str')).toBeUndefined();
  });

  it('never stands for a name a key or Table slot already holds, even where that holds nothing', () => {
    const fields: TemplateField[] = [
      { key: 'agi', label: 'Agility bonus', type: 'number' },
      { key: 'agility', label: 'Agi', type: 'number' },
      { key: 'stats', label: 'Abilities', type: 'scores', slots: ['STR'] },
      { key: 'might', label: 'Str', type: 'number' },
    ];
    const lookupOf = (record: Record<string, unknown>): ReturnType<typeof statblockLookup> => statblockLookup({ ...TEMPLATE, fields }, record);
    expect(lookupOf({ agi: 3, agility: 1, stats: [12], might: 5 })('agi')).toBe(3);
    expect(lookupOf({ agility: 1, might: 5 })('agi')).toBeUndefined();
    expect(lookupOf({ agility: 1, stats: [12], might: 5 })('str')).toBe(12);
    expect(lookupOf({ agility: 1, might: 5 })('str')).toBeUndefined();
  });

  it('fills a roll on the card, which then rolls', () => {
    const shown = withReferencesFilled(NOTE, FIELDS, lookup);
    expect(shown.background).toBe('It feels pretty good 2d8+2');
    expect(shown.experiences).toMatchObject({ 'Test Experience 3': '+4+1' });
    expect(splitDiceSegments(String(shown.background)).filter((segment) => segment.dice).map((segment) => segment.text)).toEqual(['2d8+2']);
  });
});
