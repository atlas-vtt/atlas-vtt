import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { keptKeys } from '../../../../src/app/statblocks/format/keptValues';
import { parseTemplate } from '../../../../src/app/statblocks/format/parseTemplate';
import { serializeTemplate } from '../../../../src/app/statblocks/format/templateFormat';
import { TEMPLATE_FORMAT, type StatblockTemplate, type TemplateField } from '../../../../src/app/statblocks/model/templateTypes';
import { plain } from './templateMutations';

function read(fields: unknown[]): { template: StatblockTemplate; problems: string[] } {
  const result = parseTemplate({ format: TEMPLATE_FORMAT, version: 1, id: 'fields-abc123', fields, layout: { maxColumns: 2, blocks: [] } });
  if (result.template === null) throw new Error(result.problems.join(' '));
  return { template: result.template, problems: result.problems };
}

function writtenFields(template: StatblockTemplate): unknown {
  return JSON.parse(serializeTemplate(template)).fields;
}

describe('field keys', () => {
  it.each(['statblock', 'atlas-template', 'layout', 'tags', 'aliases', 'cssclasses', 'cssclass', 'columns', 'bestiary', 'statblock-link'])(
    'leaves out a field keyed by the reserved %s',
    (key) => {
      const { template, problems } = read([{ key, label: 'X', type: 'text' }, { key: 'hp', label: 'HP', type: 'number' }]);
      expect(template.fields.map((field) => field.key)).toEqual(['hp']);
      expect(problems).toEqual([expect.stringContaining('reserved')]);
    },
  );

  it('allows name and image, which readers outside the template treat specially', () => {
    const { template, problems } = read([{ key: 'name', label: 'Name', type: 'text' }, { key: 'image', label: 'Art', type: 'image' }]);
    expect(template.fields.map((field) => field.key)).toEqual(['name', 'image']);
    expect(problems).toEqual([]);
  });

  it('leaves out fields without a usable key', () => {
    const { template, problems } = read([{ label: 'A' }, { key: '', label: 'B' }, { key: 3, label: 'C' }, 'hp', null]);
    expect(template.fields).toEqual([]);
    expect(problems).toHaveLength(5);
  });

  it('keeps the first of two fields with one key', () => {
    const { template, problems } = read([{ key: 'hp', label: 'HP', type: 'number' }, { key: 'hp', label: 'Health', type: 'text' }]);
    expect(template.fields).toEqual([{ key: 'hp', label: 'HP', type: 'number' }]);
    expect(problems).toEqual([expect.stringContaining('an earlier field already uses')]);
  });

  it('writes fields it left out back while the field list is unchanged', () => {
    const fields = [{ key: 'tags', label: 'Tags', type: 'list' }, { key: 'hp', label: 'HP', type: 'number' }];
    const { template } = read(fields);
    expect(writtenFields(template)).toEqual(fields);
    const edited = produce(template, (draft) => {
      const hp = draft.fields[0];
      if (hp) hp.label = 'Health';
    });
    expect(writtenFields(edited)).toEqual([{ key: 'hp', label: 'Health', type: 'number' }]);
  });
});

describe('field values', () => {
  it('reads a field type this Atlas does not know as text and writes the file\'s type back', () => {
    const { template, problems } = read([{ key: 'purse', label: 'Purse', type: 'currency', unit: 'gp' }]);
    expect(plain(template.fields)).toEqual([{ key: 'purse', label: 'Purse', type: 'text', unit: 'gp' }]);
    expect(keptKeys(template.fields[0] as TemplateField)).toEqual(['type']);
    expect(problems).toEqual([expect.stringContaining('"type" is "currency", not a field type this version of Atlas knows')]);
    expect(writtenFields(template)).toEqual([{ key: 'purse', label: 'Purse', type: 'currency', unit: 'gp' }]);
  });

  it('keeps the unknown type through edits of other keys and drops it once the type is chosen', () => {
    const { template } = read([{ key: 'purse', label: 'Purse', type: 'currency' }]);
    const relabelled = produce(template, (draft) => {
      const purse = draft.fields[0];
      if (purse) purse.label = 'Coins';
    });
    expect(writtenFields(relabelled)).toEqual([{ key: 'purse', label: 'Coins', type: 'currency' }]);
    const retyped = produce(relabelled, (draft) => {
      const purse = draft.fields[0];
      if (purse) purse.type = 'number';
    });
    expect(writtenFields(retyped)).toEqual([{ key: 'purse', label: 'Coins', type: 'number' }]);
  });

  it('reads a field without a type as text and one without a label by its key', () => {
    const { template, problems } = read([{ key: 'speed' }]);
    expect(template.fields).toEqual([{ key: 'speed', label: 'speed', type: 'text' }]);
    expect(problems).toEqual([]);
  });

  it('ignores a meaning it does not know and writes it back', () => {
    const { template, problems } = read([{ key: 'speed', label: 'Speed', type: 'text', meaning: 'movement' }]);
    expect(template.fields[0]?.meaning).toBeUndefined();
    expect(problems).toEqual([expect.stringContaining('"meaning" is "movement"')]);
    expect(writtenFields(template)).toEqual([{ key: 'speed', label: 'Speed', type: 'text', meaning: 'movement' }]);
  });

  it('reads every optional key of a field', () => {
    const field = {
      key: 'size', label: 'Size', type: 'choice', meaning: 'size', formerKeys: ['sz'], unit: 'cells', options: ['Small', 'Large'],
      open: false, slots: ['A'], slotKeys: ['a'], entry: { nameKey: 'n', textKey: 't', extras: [{ key: 'cost', label: 'Cost', type: 'number' }] },
      prompt: 'Add size',
    };
    const { template, problems } = read([field]);
    expect(template.fields).toEqual([field]);
    expect(problems).toEqual([]);
  });

  it('leaves out list entries of the wrong kind, keeping the list for writing back', () => {
    const { template, problems } = read([{ key: 'size', label: 'Size', type: 'choice', options: ['Small', 4, 'Large'], formerKeys: [''] }]);
    expect(plain(template.fields[0])).toEqual({ key: 'size', label: 'Size', type: 'choice', options: ['Small', 'Large'], formerKeys: [] });
    expect(problems).toHaveLength(2);
    expect(writtenFields(template)).toEqual([{ key: 'size', label: 'Size', type: 'choice', options: ['Small', 4, 'Large'], formerKeys: [''] }]);
  });

  it('reads entry parts with a key, text by default', () => {
    const extras = [{ key: 'range', type: 'distance' }, { label: 'No key' }, { key: 'cost', label: 'Cost', type: 'number' }];
    const { template } = read([{ key: 'moves', label: 'Moves', type: 'entries', entry: { textKey: 'text', extras } }]);
    expect(plain(template.fields[0]?.entry)).toEqual({
      textKey: 'text', extras: [{ key: 'range', label: 'range', type: 'text' }, { key: 'cost', label: 'Cost', type: 'number' }],
    });
    expect(writtenFields(template)).toEqual([{ key: 'moves', label: 'Moves', type: 'entries', entry: { textKey: 'text', extras } }]);
  });

  it('keeps unknown keys of fields, entry shapes and their parts', () => {
    const field = {
      key: 'moves', label: 'Moves', type: 'entries', hint: 'h',
      entry: { nameKey: 'n', future: true, extras: [{ key: 'cost', label: 'Cost', type: 'number', unit: 'mp' }] },
    };
    const { template } = read([field]);
    expect(template.fields).toEqual([field]);
    expect(writtenFields(template)).toEqual([field]);
  });
});

describe('choices', () => {
  it('keep their options and whether they take several, each with a number, through a write and a read', () => {
    const senses = { key: 'senses', label: 'Senses', type: 'choice', options: ['darkvision', 'blindsight'], several: true, numbered: true, unit: 'ft.' };
    const { template, problems } = read([senses]);
    expect(problems).toEqual([]);
    expect(template.fields).toEqual([senses]);
    expect(writtenFields(template)).toEqual([senses]);
  });

  it('read a switch that is no boolean as unset, and say so', () => {
    const { template, problems } = read([{ key: 'senses', label: 'Senses', type: 'choice', several: 'yes' }]);
    expect(template.fields[0]?.several).toBeUndefined();
    expect(problems).toEqual([expect.stringContaining('several')]);
  });
});
