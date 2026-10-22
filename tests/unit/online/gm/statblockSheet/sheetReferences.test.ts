import { describe, expect, it } from 'vitest';
import { statblockSheet } from '../../../../../src/app/online/gm/book/statblockSheet';
import { parseBookStatblock, referenceNumber } from '../../../../../src/app/online/protocol/index.ts';
import type { StatblockTemplate, TemplateField } from '../../../../../src/app/statblocks/model/templateTypes';
import { fillReferences } from '../../../../../src/app/statblocks/values/fillReferences';
import { templateOf } from '../../../statblocks/render/sheetTestKit';
import { resolvedOf } from './sheetKit';

const FIELDS: TemplateField[] = [
  { key: 'name', label: 'Name', type: 'text' },
  { key: 'level', label: 'Level', type: 'number' },
  { key: 'prof', label: 'Proficiency', type: 'number', formerKeys: ['pb'] },
  { key: 'stats', label: 'Abilities', type: 'scores', slots: ['STR', 'DEX', 'INT'], slotKeys: ['strength', 'dexterity', 'intelligence'] },
  { key: 'saves', label: 'Saving Throws', type: 'pairs' },
  { key: 'hit_points', label: 'Hit points', type: 'number' },
  { key: 'ac', label: 'AC', type: 'number' },
  { key: 'secret', label: 'Secret', type: 'number' },
  { key: 'background', label: 'Background', type: 'markdown' },
];
const TEMPLATE: StatblockTemplate = {
  ...templateOf(FIELDS, [
    { id: 'stats001', type: 'scores', field: 'stats', orientation: 'row', columns: [{ label: 'Mod', formula: 'floor((value - 10) / 2)' }, { label: 'Save', field: 'saves', formula: 'floor((value - 10) / 2)' }] },
    { id: 'back0001', type: 'text', field: 'background' },
  ]),
  players: { secret: 'hidden' },
};
const NOTE = { name: 'Mira', level: 5, pb: 3, stats: [16, 14, 8], saves: [{ dex: 5 }], hit_points: 22, ac: '10 + @dex.mod', secret: 424242, background: 'Strikes for 2d8+@str.' };

const drawn = (template: StatblockTemplate = TEMPLATE, status: 'ok' | 'missing' = 'ok'): ReturnType<typeof statblockSheet> =>
  statblockSheet({ resolved: resolvedOf(template, NOTE, status), definitions: [], resources: undefined });

describe('the numbers a player\'s references read on their sheet', () => {
  it('names every number the card\'s lookup reads, by the key a reference\'s path makes', () => {
    const references = drawn()!.references;
    expect(references).toMatchObject({ level: 5, prof: 3, pb: 3, str: 16, strength: 16, 'stats.str': 16, 'str.mod': 3, 'int.mod': -1, 'dex.save': 5, 'stats.dex.save': 5, ac: 12, hp: 22, hitpoints: 22 });
    expect(referenceNumber(references, 'Str.Mod')).toBe(3);
    expect(referenceNumber(references, 'hit-points')).toBe(22);
  });

  it('fills in a player\'s formula as the card does', () => {
    const references = drawn()!.references;
    const lookup = (path: string): number | undefined => referenceNumber(references, path);
    expect(fillReferences('2d8+@str', lookup).text).toBe('2d8+16');
    expect(fillReferences('1d8 + @str.mod', lookup).text).toBe('1d8 + 3');
    expect(fillReferences('1d20 + @int.mod', lookup).text).toBe('1d20 - 1');
  });

  it('names a field by its label too, as the card reads it, never one the player may not see', () => {
    const fields: TemplateField[] = [
      { key: 'name', label: 'Name', type: 'text' },
      { key: 'agility', label: 'Agi', type: 'number' },
      { key: 'strength', label: 'Str', type: 'number' },
      { key: 'luck', label: 'Lck', type: 'number' },
      { key: 'background', label: 'Background', type: 'markdown' },
    ];
    const template: StatblockTemplate = {
      ...templateOf(fields, [{ id: 'traits01', type: 'metric', fields: ['agility', 'strength', 'luck'] }, { id: 'back0001', type: 'text', field: 'background' }]),
      players: { luck: 'hidden' },
    };
    const note = { name: 'Kestrel Vane', agility: 1, strength: 2, luck: 777, background: 'It feels pretty good 2d8+@str' };
    const references = statblockSheet({ resolved: resolvedOf(template, note, 'ok'), definitions: [], resources: undefined })!.references;
    expect(references).toMatchObject({ agi: 1, str: 2, agility: 1, strength: 2 });
    expect(references).not.toHaveProperty('lck');
    expect(references).not.toHaveProperty('luck');
    expect(fillReferences('2d8+@str', (path) => referenceNumber(references, path)).text).toBe('2d8+2');
  });

  it('names nothing of a field the player may not see', () => {
    const statblock = drawn()!;
    expect(statblock.references).not.toHaveProperty('secret');
    expect(JSON.stringify(statblock)).not.toContain('424242');
  });

  it('travels as the page reads it, and only with a statblock the player may change', () => {
    const statblock = drawn()!;
    expect(parseBookStatblock(statblock)).toEqual(statblock);
    expect(drawn(TEMPLATE, 'missing')!.references).toBeUndefined();
  });
});
