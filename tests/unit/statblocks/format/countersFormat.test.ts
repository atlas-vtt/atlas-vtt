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
  id: 'counters-abc123',
  fields: [{
    key: 'slots', label: 'Spell slots', type: 'counters',
    counterRows: [{ name: '1st level', max: 0 }, { name: 'Ki', max: 3, regain: '1d4' }, { name: 'Luck', max: 1 }],
  }],
  layout: { maxColumns: 1, blocks: [{ id: 'slots001', type: 'counters', field: 'slots', label: 'Slots' }] },
};

describe('Counters in the template file', () => {
  it('holds the field and its preset rows, and the block, written in a fixed order and read back the same', () => {
    const { template, problems } = read(FILE);
    expect(problems).toEqual([]);
    expect(template.fields[0]).toEqual(FILE.fields[0]);
    expect(template.layout.blocks[0]).toEqual(FILE.layout.blocks[0]);
    const text = serializeTemplate(template);
    const json = JSON.parse(text);
    expect(Object.keys(json)).toEqual(['format', 'version', 'id', 'fields', 'layout']);
    expect(Object.keys(json.fields[0])).toEqual(['key', 'label', 'type', 'counterRows']);
    expect(Object.keys(json.fields[0].counterRows[1])).toEqual(['name', 'max', 'regain']);
    expect(Object.keys(json.layout.blocks[0])).toEqual(['id', 'type', 'field', 'label']);
    expect(serializeTemplate(read(json).template)).toBe(text);
  });

  it('keeps keys it does not know, on the block, the field and a preset row', () => {
    const file = {
      ...FILE,
      fields: [{ ...FILE.fields[0], future: 1, counterRows: [{ name: 'Ki', max: 2, colour: 'red' }] }],
      layout: { maxColumns: 1, blocks: [{ ...FILE.layout.blocks[0], look: 'stars' }] },
    };
    const { template, problems } = read(file);
    expect(problems).toEqual([]);
    const json = JSON.parse(serializeTemplate(template));
    expect(json.fields[0]).toMatchObject({ future: 1, counterRows: [{ name: 'Ki', max: 2, colour: 'red' }] });
    expect(json.layout.blocks[0]).toMatchObject({ look: 'stars' });
  });

  it('reports a preset row it cannot read, leaves it out and writes it back as the file had it', () => {
    const odd = { ...FILE.fields[0], counterRows: [{ max: 2 }, { name: 'Ki', max: 1.5, reset: 3 }] };
    const { template, problems } = read({ ...FILE, fields: [odd] });
    expect(template.fields[0]?.counterRows).toMatchObject([{ name: 'Ki', max: 0 }]);
    expect(problems.length).toBeGreaterThan(0);
    expect(JSON.parse(serializeTemplate(template)).fields[0].counterRows).toEqual(odd.counterRows);
  });

  it('notes a regained count that is no formula Atlas rolls, keeping it as written', () => {
    const odd = { ...FILE.fields[0], counterRows: [{ name: 'Wand', max: 3, regain: 'plenty' }] };
    const { template, problems } = read({ ...FILE, fields: [odd] });
    expect(template.fields[0]?.counterRows).toEqual(odd.counterRows);
    expect(problems).toEqual(['Field "slots": counter "Wand" regains "plenty", which is no dice formula Atlas rolls; it regains all of its uses.']);
    expect(JSON.parse(serializeTemplate(template)).fields[0].counterRows).toEqual(odd.counterRows);
  });

  it('keeps the refills and row refills an earlier build wrote as keys nothing reads, written back as the file had them', () => {
    const earlier = {
      ...FILE,
      fields: [{ ...FILE.fields[0], counterRows: [{ name: 'Ki', max: 2, reset: 'Short rest' }] }],
      refills: [{ name: 'Short rest' }, { name: 'Long rest', includes: ['Short rest'] }],
    };
    const { template, problems } = read(earlier);
    expect(problems).toEqual([]);
    expect(JSON.parse(serializeTemplate(template))).toEqual(earlier);
  });

  it('keeps a Counters block without a field as it was read', () => {
    const { template } = read({ ...FILE, layout: { maxColumns: 1, blocks: [{ id: 'slots001', type: 'counters' }] } });
    expect(template.layout.blocks[0]?.type).toBe('opaque');
  });
});
