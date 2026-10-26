import { describe, expect, it } from 'vitest';
import { splitDiceSegments } from '../../../../src/app/services/statblockDiceText';
import type { StatblockTemplate, TemplateField } from '../../../../src/app/statblocks/model/templateTypes';
import { fillReferences, withReferencesFilled } from '../../../../src/app/statblocks/values/fillReferences';
import { statblockLookup } from '../../../../src/app/statblocks/values/statblockLookup';
import { coerce } from '../../../../src/app/statblocks/values/valueCoercion';
import { referenceMisfit } from '../../../../src/app/statblocks/values/valueFit';
import { templateOf } from '../render/sheetTestKit';

const FIELDS: TemplateField[] = [
  { key: 'name', label: 'Name', type: 'text' },
  { key: 'level', label: 'Level', type: 'number' },
  { key: 'prof', label: 'Proficiency', type: 'number', formerKeys: ['pb'] },
  { key: 'stats', label: 'Abilities', type: 'scores', slots: ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'], slotKeys: ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'] },
  { key: 'saves', label: 'Saving Throws', type: 'pairs' },
  { key: 'ac', label: 'AC', type: 'number' },
  { key: 'damage', label: 'Damage', type: 'dice' },
  { key: 'actions', label: 'Actions', type: 'entries' },
];
const TEMPLATE: StatblockTemplate = templateOf(FIELDS, [
  {
    id: 'stats001', type: 'scores', field: 'stats', orientation: 'row',
    columns: [{ label: 'Mod', formula: 'floor((value - 10) / 2)', display: 'signed' }, { label: 'Save', field: 'saves', formula: 'floor((value - 10) / 2)' }],
  },
]);
const RECORD = { name: 'Mira', level: 5, pb: 3, stats: [16, 14, 12, 8, 10, 13], saves: [{ dex: 5 }] };
const lookup = statblockLookup(TEMPLATE, RECORD);

describe('what a statblock\'s references read', () => {
  it('reads a field by its key or a key it had, and a dotted index into it', () => {
    expect(lookup('level')).toBe(5);
    expect(lookup('prof')).toBe(3);
    expect(statblockLookup(TEMPLATE, { prof: 2 })('pb')).toBe(2);
    expect(lookup('stats.0')).toBe(16);
    expect(lookup('saves.dex')).toBe(5);
  });

  it('reads a Table\'s score by its slot\'s name or key, and a worked-out row of the Table after it', () => {
    expect(lookup('str')).toBe(16);
    expect(lookup('STRENGTH')).toBe(16);
    expect(lookup('stats.int')).toBe(8);
    expect(lookup('str.mod')).toBe(3);
    expect(lookup('int.mod')).toBe(-1);
    // A row's own entry wins over its formula
    expect(lookup('dex.save')).toBe(5);
    expect(lookup('con.save')).toBe(1);
  });

  it('reads nothing for what holds no single value or no row of that name', () => {
    expect(lookup('stats')).toBeUndefined();
    expect(lookup('str.bonus')).toBeUndefined();
    expect(lookup('nothing')).toBeUndefined();
  });
});

describe('a statblock\'s values as its card shows them', () => {
  const fill = (text: string): ReturnType<typeof fillReferences> => fillReferences(text, lookup);

  it('writes each reference as the number it names, the terms as written', () => {
    expect(fill('2d6 + 12 + @int.mod')).toMatchObject({ text: '2d6 + 12 - 1', unresolved: [] });
    expect(fill('Hit: 1d8 + @str.mod slashing')).toMatchObject({ text: 'Hit: 1d8 + 3 slashing', unresolved: [] });
    expect(fill('2+@strength').text).toBe('2+16');
    expect(fill('@level d6 fire').text).toBe('5d6 fire');
    expect(fill('@leveld8').text).toBe('5d8');
    expect(fill('@level-1').text).toBe('5-1');
  });

  it('merges a negative number into the sign before it, a typeset minus too, and brackets it after * and /', () => {
    expect(fill('2d6 − @int.mod').text).toBe('2d6 + 1');
    expect(fill('1d8 + @int.mod').text).toBe('1d8 - 1');
    expect(fill('2 * @int.mod').text).toBe('2 * (-1)');
    expect(fill('@int.mod').text).toBe('-1');
  });

  it('reads a value that names references itself as what it comes to, never in a circle', () => {
    const note = { ...RECORD, ac: '10 + @dex.mod', loop: '@loop' };
    const chained = statblockLookup({ ...TEMPLATE, fields: [...FIELDS, { key: 'loop', label: 'Loop', type: 'number' }] }, note);
    expect(fillReferences('1d20 + @ac', chained).text).toBe('1d20 + 12');
    expect(fillReferences('1 + @loop', chained).unresolved).toEqual(['loop']);
  });

  it('works out a value that names many others once each, whatever a note piles up', () => {
    const keys = ['a', 'b', 'c', 'd', 'e'];
    const pile = Object.fromEntries(keys.map((key, at) => [key, at === keys.length - 1 ? 1 : Array.from({ length: 40 }, () => `@${keys[at + 1]!}`).join(' + ')]));
    const piled = statblockLookup({ ...TEMPLATE, fields: [...FIELDS, ...keys.map((key): TemplateField => ({ key, label: key, type: 'number' }))] }, pile);
    const started = performance.now();
    expect(fillReferences('@a', piled).text).toBe(String(40 ** 4));
    expect(performance.now() - started).toBeLessThan(200);
  });

  it('leaves a reference that names no number as written, and a word\'s @ alone', () => {
    expect(fill('1d4 + @luck')).toMatchObject({ text: '1d4 + @luck', unresolved: ['luck'] });
    expect(fill('write to mira@example.org').text).toBe('write to mira@example.org');
  });

  it('fills every value of the template, lists and entries too, keeps the note\'s record, and totals a Number field', () => {
    const note = { ...RECORD, ac: '10 + @dex.mod', damage: '2d6+@str.mod', actions: [{ name: 'Bite', desc: 'Hit: 1d6 + @str.mod' }] };
    const shown = withReferencesFilled(note, FIELDS, statblockLookup(TEMPLATE, note));
    expect(shown).toMatchObject({ ac: 12, damage: '2d6+3', actions: [{ name: 'Bite', desc: 'Hit: 1d6 + 3' }] });
    expect(note.ac).toBe('10 + @dex.mod');
    expect(withReferencesFilled(RECORD, FIELDS, lookup)).toBe(RECORD);
  });
});

describe('values written with references', () => {
  it('are kept as typed in a Dice or Number field when they read as one', () => {
    expect(coerce('dice', '2d6 + @str.mod')).toEqual({ ok: true, value: '2d6 + @str.mod' });
    expect(coerce('dice', '@level d6')).toEqual({ ok: true, value: '@level d6' });
    expect(coerce('number', '10 + @dex.mod')).toEqual({ ok: true, value: '10 + @dex.mod' });
    expect(coerce('number', 'fast @dex').ok).toBe(false);
  });

  it('say which reference names no number: in a Number or Dice field any, elsewhere one in a formula', () => {
    expect(referenceMisfit({ type: 'dice' }, '1d4 + @luck')).toEqual({ label: 'Unknown reference', problem: '@luck names no number of this statblock.' });
    expect(referenceMisfit({ type: 'dice' }, '1d4 + 3')).toBeNull();
    expect(referenceMisfit({ type: 'markdown' }, 'Hit: 1d4 + @luck')).not.toBeNull();
    expect(referenceMisfit({ type: 'markdown' }, 'Ask @DM before the fight')).toBeNull();
  });

  it('roll nothing that an unfilled reference is added to', () => {
    expect(splitDiceSegments('Hit: 2d6 + 12 + @int fire').some((segment) => segment.dice)).toBe(false);
    expect(splitDiceSegments('@str + 1d4').some((segment) => segment.dice)).toBe(false);
    for (const text of ['2d6 + (@int)', '2d6 + 2 * @int', '@level d6 fire']) expect(splitDiceSegments(text).some((segment) => segment.dice)).toBe(false);
    expect(splitDiceSegments('me@x.dev - 1d12+2').filter((segment) => segment.dice).map((segment) => segment.text)).toEqual(['1d12+2']);
    expect(splitDiceSegments('Hit: 2d6 + 3, then 1d4')).toEqual([
      { text: 'Hit: ', dice: false }, { text: '2d6 + 3', dice: true }, { text: ', then ', dice: false }, { text: '1d4', dice: true },
    ]);
  });
});
