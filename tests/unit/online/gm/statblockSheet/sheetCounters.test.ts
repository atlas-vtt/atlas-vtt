import { describe, expect, it } from 'vitest';
import { statblockSheet } from '../../../../../src/app/online/gm/book/statblockSheet';
import { parseBookStatblock, sheetBase, type BookStatblock, type SheetNode } from '../../../../../src/app/online/protocol/index.ts';
import type { StatblockTemplate, TemplateField } from '../../../../../src/app/statblocks/model/templateTypes';
import { templateOf } from '../../../statblocks/render/sheetTestKit';
import { resolvedOf } from './sheetKit';

const SLOTS: TemplateField = {
  key: 'slots', label: 'Spell slots', type: 'counters',
  counterRows: [{ name: '1st level', max: 2 }, { name: '2nd level', max: 0 }],
};
/** What template files of earlier builds hold: refills, which recovery buttons replaced and nothing reads. */
const EARLIER_KEYS = { refills: [{ name: 'Short rest' }, { name: 'Long rest', includes: ['Short rest'] }] };
const TEMPLATE: StatblockTemplate = {
  ...templateOf([{ key: 'name', label: 'Name', type: 'text' }, SLOTS], [{ id: 'slots001', type: 'counters', field: 'slots' }]),
  ...EARLIER_KEYS,
};
const ROWS = [
  { name: '1st level', max: 4, used: 1, reset: 'Long rest' },
  { name: '2nd level', max: 0, used: 0, reset: 'Long rest' },
  { name: 'Ki', max: 3, used: 0, reset: 'Short rest', regain: '1d4', colour: 'red' },
];

const drawn = (note: Record<string, unknown>, template = TEMPLATE): BookStatblock =>
  statblockSheet({ resolved: resolvedOf(template, { name: 'Ana', ...note }), definitions: [], resources: undefined })!;

const countersOf = (statblock: BookStatblock): Extract<SheetNode, { k: 'counters' }> | undefined =>
  statblock.blocks.find((node): node is Extract<SheetNode, { k: 'counters' }> => node.k === 'counters');

describe('Counters on a player\'s sheet', () => {
  it('carries every row as the note holds it, rows without uses too, and the field a player changes them by', () => {
    const statblock = drawn({ slots: ROWS });
    expect(parseBookStatblock(statblock)).toEqual(statblock);
    const node = countersOf(statblock);
    expect(node).toMatchObject({
      label: 'Spell slots',
      counters: [
        { name: '1st level', max: 4, used: 1, reset: 'Long rest', regain: null },
        { name: '2nd level', max: 0, used: 0, reset: 'Long rest', regain: null },
        { name: 'Ki', max: 3, used: 0, reset: 'Short rest', regain: '1d4' },
      ],
    });
    expect(node?.field).toMatchObject({ key: 'slots', type: 'counters', base: sheetBase(ROWS) });
  });

  it('sends no refills, whatever the template file still holds', () => {
    expect(drawn({ slots: ROWS })).not.toHaveProperty('refills');
  });

  it('carries the template\'s preset rows where the note holds none', () => {
    const node = countersOf(drawn({}));
    expect(node?.counters).toEqual([{ name: '1st level', max: 2, used: 0, reset: null, regain: null }, { name: '2nd level', max: 0, used: 0, reset: null, regain: null }]);
    expect(node?.field?.base).toBe(sheetBase(undefined));
  });

  it('is only read where players may only see it, and never sent where they may not', () => {
    expect(countersOf(drawn({ slots: ROWS }, { ...TEMPLATE, players: { slots: 'read' } }))?.field).toBeNull();
    const hidden = drawn({ slots: [{ name: 'SENTINEL', max: 2, used: 1 }] }, { ...TEMPLATE, players: { slots: 'hidden' } });
    expect(countersOf(hidden)).toBeUndefined();
    expect(JSON.stringify(hidden)).not.toContain('SENTINEL');
  });

  it('shows a value that is no list of counters, or one the page cannot carry as it is, as written and never changed', () => {
    for (const slots of [[{ name: 'Ki', max: 2, used: 5 }], [{ name: '  Ki  ', max: 2, used: 0 }], [{ name: 'Ki', max: 2, used: 0, regain: 'some' }], Array.from({ length: 30 }, (_, at) => ({ name: `Row ${at}`, max: 1, used: 0 }))]) {
      const statblock = drawn({ slots });
      expect(parseBookStatblock(statblock)).toEqual(statblock);
      expect(countersOf(statblock)).toBeUndefined();
      expect(statblock.blocks[0]).toMatchObject({ k: 'value', value: { field: null } });
    }
  });
});
