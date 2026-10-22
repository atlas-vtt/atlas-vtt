import { describe, expect, it } from 'vitest';
import { withMetricNumberLook, withNumberLook } from '../../../../src/app/statblocks/model/numberLooks';
import { tileKind } from '../../../../src/app/statblocks/model/templateGrid';
import { trackedNumbers } from '../../../../src/app/statblocks/values/trackedNumbers';
import { TEMPLATE_FORMAT, type StatblockTemplate, type TemplateBlock, type TemplateField } from '../../../../src/app/statblocks/model/templateTypes';

const FIELDS: TemplateField[] = [
  { key: 'hp', label: 'Hit Points', type: 'number' },
  { key: 'hope', label: 'Hope', type: 'number', tracks: { counts: 'up' } },
  { key: 'evasion', label: 'Evasion', type: 'number' },
  { key: 'notes', label: 'Notes', type: 'text' },
];

const template = (...blocks: TemplateBlock[]): StatblockTemplate =>
  ({ format: TEMPLATE_FORMAT, version: 1, id: 'looks-abc123', fields: FIELDS, layout: { maxColumns: 1, blocks } });

const field = (result: StatblockTemplate, key: string): TemplateField | undefined => result.fields.find((entry) => entry.key === key);

describe('a Value shown as a track', () => {
  it('turns into a Track of boxes that counts down, and starts tracking its number', () => {
    const result = withNumberLook(template({ id: 'hp000000', type: 'stat', field: 'hp', look: 'stacked' }), 'hp000000', 'boxes');
    expect(result.layout.blocks).toEqual([{ id: 'hp000000', type: 'track', field: 'hp', look: 'boxes', counts: 'down' }]);
    expect(field(result, 'hp')?.tracks).toEqual({ counts: 'down' });
    expect(tileKind(result.layout.blocks[0]!)).toBe('value');
  });

  it('keeps how a tracked number counts, and its label', () => {
    const result = withNumberLook(template({ id: 'hope0000', type: 'stat', field: 'hope', label: 'Hope', look: 'run-in' }), 'hope0000', 'gauge');
    expect(result.layout.blocks[0]).toMatchObject({ type: 'track', label: 'Hope', look: 'gauge', counts: 'up' });
  });

  it('goes back to a number that stays tracked, also where only its Track tracked it', () => {
    const result = withNumberLook(template({ id: 'hp000000', type: 'track', field: 'hp', look: 'boxes', counts: 'up' }), 'hp000000', 'number');
    expect(result.layout.blocks[0]).toMatchObject({ type: 'stat', field: 'hp' });
    expect(trackedNumbers(result).find((number) => number.field.key === 'hp')?.counts).toBe('up');
  });

  it('leaves what is no number as it is', () => {
    const notes = template({ id: 'notes000', type: 'stat', field: 'notes', look: 'run-in' });
    expect(withNumberLook(notes, 'notes000', 'boxes')).toBe(notes);
  });
});

describe('a number of a Metric shown as a track', () => {
  const metric: TemplateBlock = { id: 'metric01', type: 'metric', heading: 'Defences', fields: ['hp', 'evasion'] };

  it('leaves the Metric for a Track of its own right after it', () => {
    const result = withMetricNumberLook(template(metric, { id: 'divider0', type: 'divider' }), 'metric01', 'hp', 'boxes');
    expect(result.layout.blocks.map((block) => block.type)).toEqual(['metric', 'track', 'divider']);
    expect(result.layout.blocks[0]).toMatchObject({ fields: ['evasion'] });
    expect(result.layout.blocks[1]).toMatchObject({ field: 'hp', look: 'boxes', counts: 'down' });
    expect(field(result, 'hp')?.tracks).toEqual({ counts: 'down' });
  });

  it('goes after the Side by side a Metric stands in', () => {
    const row: TemplateBlock = { id: 'row00000', type: 'row', blocks: [metric, { id: 'notes000', type: 'stat', field: 'notes', look: 'run-in' }] };
    const result = withMetricNumberLook(template(row), 'metric01', 'evasion', 'gauge');
    expect(result.layout.blocks.map((block) => block.type)).toEqual(['row', 'track']);
  });

  it('takes the Metric\'s place where it was its only number', () => {
    const only: TemplateBlock = { id: 'metric01', type: 'metric', fields: ['hope'] };
    const result = withMetricNumberLook(template(only), 'metric01', 'hope', 'boxes');
    expect(result.layout.blocks).toEqual([{ id: 'metric01', type: 'track', field: 'hope', look: 'boxes', counts: 'up' }]);
  });
});
