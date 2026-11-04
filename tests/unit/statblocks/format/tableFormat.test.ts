import { describe, expect, it } from 'vitest';
import { parseTemplate } from '../../../../src/app/statblocks/format/parseTemplate';
import { serializeTemplate } from '../../../../src/app/statblocks/format/templateFormat';
import { TEMPLATE_FORMAT, type StatblockTemplate } from '../../../../src/app/statblocks/model/templateTypes';

function read(input: Record<string, unknown>): { template: StatblockTemplate; problems: string[] } {
  const result = parseTemplate(input);
  if (result.template === null) throw new Error(result.problems.join(' '));
  return { template: result.template, problems: result.problems };
}

const FILE = {
  format: TEMPLATE_FORMAT,
  version: 1,
  id: 'tables-abc123',
  fields: [{
    key: 'loot', label: 'Loot', type: 'scores', slots: ['Item', 'Qty', ''], slotKeys: ['gear'], header: false,
    rows: [['Rope', 1, null], []], align: [null, 'end'], addRows: false, addColumns: false,
  }],
  layout: { maxColumns: 1, blocks: [{ id: 'loot0001', type: 'scores', field: 'loot', orientation: 'row' }] },
};

describe('a Table in the template file', () => {
  it('holds its starting table, header row, alignments and what statblocks may change, written in a fixed order and read back the same', () => {
    const { template, problems } = read(FILE);
    expect(problems).toEqual([]);
    expect(template.fields[0]).toEqual(FILE.fields[0]);
    const text = serializeTemplate(template);
    const written = JSON.parse(text).fields[0];
    expect(Object.keys(written)).toEqual(['key', 'label', 'type', 'slots', 'slotKeys', 'header', 'rows', 'align', 'addRows', 'addColumns']);
    expect(serializeTemplate(read(JSON.parse(text)).template)).toBe(text);
  });

  it('reads an older table of named columns as one row under its header, which statblocks keep as it is', () => {
    const { template } = read({ ...FILE, fields: [{ key: 'stats', label: 'Abilities', type: 'scores', slots: ['STR', 'DEX'] }] });
    expect(template.fields[0]).toEqual({ key: 'stats', label: 'Abilities', type: 'scores', slots: ['STR', 'DEX'] });
  });

  it('reports what it cannot read, leaves it out and writes it back as the file had it', () => {
    const odd = { ...FILE.fields[0], header: 'no', rows: [['Rope', { a: 1 }], ['Torch']], align: ['middle', 'center'], addRows: 'yes' };
    const { template, problems } = read({ ...FILE, fields: [odd] });
    expect(template.fields[0]).toMatchObject({ rows: [['Torch']], align: ['center'] });
    expect(template.fields[0]).not.toHaveProperty('header');
    expect(template.fields[0]).not.toHaveProperty('addRows');
    expect(problems).toHaveLength(4);
    expect(JSON.parse(serializeTemplate(template)).fields[0]).toMatchObject({ header: 'no', rows: odd.rows, align: odd.align, addRows: 'yes' });
  });
});
