import { describe, expect, it } from 'vitest';
import type { StatblockTemplate, TemplateField } from '../../../../src/app/statblocks/model/templateTypes';
import { namesFitting, referenceNames, referenceWord } from '../../../../src/app/statblocks/values/referenceNames';
import { statblockLookup } from '../../../../src/app/statblocks/values/statblockLookup';
import { templateOf } from '../render/sheetTestKit';

const FIELDS: TemplateField[] = [
  { key: 'name', label: 'Name', type: 'text' },
  { key: 'level', label: 'Level', type: 'number' },
  { key: 'prof', label: 'Proficiency', type: 'number', formerKeys: ['pb'] },
  { key: 'stats', label: 'Abilities', type: 'scores', slots: ['STR', 'DEX', 'CON'], slotKeys: ['strength', 'dexterity', 'constitution'] },
  { key: 'saves', label: 'Saving Throws', type: 'pairs' },
  { key: 'hit_points', label: 'Hit Points', type: 'number' },
  { key: 'ac', label: 'AC', type: 'number' },
  { key: 'secret', label: 'Secret', type: 'number' },
  { key: 'actions', label: 'Actions', type: 'entries' },
];
const TEMPLATE: StatblockTemplate = templateOf(FIELDS, [
  { id: 'stats001', type: 'scores', field: 'stats', orientation: 'row', columns: [{ label: 'Mod', formula: 'floor((value - 10) / 2)' }] },
]);
const RECORD = {
  name: 'Mira', level: 5, pb: '+3', stats: [16, 14, 8], saves: [{ dex: 5 }], hit_points: 27, ac: '10 + @dex.mod', secret: 4,
  actions: [{ name: 'Bite', desc: 'It bites.' }],
};

describe('the names `@` offers', () => {
  const names = referenceNames(TEMPLATE, RECORD);

  it('offers every field, entry, Table slot and row that names a number, with the number it reads, labels last', () => {
    expect(names).toEqual([
      { name: 'level', value: '5' },
      { name: 'prof', value: '+3' },
      { name: 'str', value: '16' },
      { name: 'str.mod', value: '3' },
      { name: 'strength', value: '16' },
      { name: 'strength.mod', value: '3' },
      { name: 'dex', value: '14' },
      { name: 'dex.mod', value: '2' },
      { name: 'dexterity', value: '14' },
      { name: 'dexterity.mod', value: '2' },
      { name: 'con', value: '8' },
      { name: 'con.mod', value: '-1' },
      { name: 'constitution', value: '8' },
      { name: 'constitution.mod', value: '-1' },
      { name: 'saves.dex', value: '5' },
      { name: 'hit_points', value: '27' },
      { name: 'ac', value: '12' },
      { name: 'secret', value: '4' },
      { name: 'hp', value: '27' },
      { name: 'proficiency', value: '+3' },
      { name: 'saving-throws.dex', value: '5' },
    ]);
  });

  it('offers only names the card reads as those numbers', () => {
    const lookup = statblockLookup(TEMPLATE, RECORD);
    for (const { name, value } of names) expect(String(lookup(name)).trim(), name).toBe(value);
  });

  it('leaves out what names no number: texts, lists, abilities, empty values', () => {
    expect(names.map((each) => each.name)).not.toEqual(expect.arrayContaining(['name', 'stats', 'actions', 'actions.0']));
    expect(referenceNames(TEMPLATE, {})).toEqual([]);
  });

  it('offers hit points by their usual name where no field is keyed so', () => {
    const plain = templateOf([{ key: 'health', label: 'Health', type: 'number' }], []);
    expect(referenceNames(plain, { health: 9 })).toEqual([{ name: 'health', value: '9' }, { name: 'hp', value: '9' }]);
  });

  it('offers a field by its label where the lookup reads it so, after every other name', () => {
    const labelled = templateOf([
      { key: 'agility', label: 'Agi', type: 'number' },
      { key: 'armor_class', label: 'Armor Class', type: 'number' },
      { key: 'might', label: 'Shared', type: 'number' },
      { key: 'grace', label: 'Shared', type: 'number' },
    ], []);
    const offered = referenceNames(labelled, { agility: 2, armor_class: 14, might: 1, grace: 3 });
    // A label two fields share names neither
    expect(offered).toEqual([
      { name: 'agility', value: '2' }, { name: 'armor_class', value: '14' }, { name: 'might', value: '1' }, { name: 'grace', value: '3' },
      { name: 'agi', value: '2' },
    ]);
    const lookup = statblockLookup(labelled, { agility: 2 });
    expect(lookup('agi')).toBe(2);
  });
});

describe('names fitting what was typed', () => {
  const names = [{ name: 'str' }, { name: 'str.mod' }, { name: 'dex.mod' }, { name: 'hit_points' }];

  it('puts names starting with it first, then those holding it, without case or separators', () => {
    expect(namesFitting(names, 'mod').map((each) => each.name)).toEqual(['str.mod', 'dex.mod']);
    expect(namesFitting(names, 'STR').map((each) => each.name)).toEqual(['str', 'str.mod']);
    expect(namesFitting(names, 'hitp').map((each) => each.name)).toEqual(['hit_points']);
    expect(namesFitting(names, '')).toEqual(names);
    expect(namesFitting(names, 'wis')).toEqual([]);
  });

  it('writes a label as a reference does', () => {
    expect(referenceWord(' Hit Points: ')).toBe('hit-points');
    expect(referenceWord('St. Mod')).toBe('st-mod');
  });
});
