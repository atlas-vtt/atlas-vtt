import { describe, expect, it } from 'vitest';
import { parseTemplate } from '../../../../src/app/statblocks/format/parseTemplate';
import { serializeTemplate } from '../../../../src/app/statblocks/format/templateFormat';
import { renameFieldKey } from '../../../../src/app/statblocks/model/fieldOps';
import {
  MAX_METRIC_NUMBERS, addMetricNumber, canAddMetricNumber, metricBlock, removeMetricNumber,
} from '../../../../src/app/statblocks/model/metricNumbers';
import { kindName, templateGrid, tileKind } from '../../../../src/app/statblocks/model/templateGrid';
import { boundField, fieldsShownBy } from '../../../../src/app/statblocks/model/treeQueries';
import { TEMPLATE_FORMAT, type MetricBlock, type StatblockTemplate } from '../../../../src/app/statblocks/model/templateTypes';

const FIELDS = [
  { key: 'major', label: 'Major', type: 'number' },
  { key: 'severe', label: 'Severe', type: 'number' },
] as const;

function templateWith(metric: MetricBlock): StatblockTemplate {
  return { format: TEMPLATE_FORMAT, version: 1, id: 'metric-abc123', fields: [...FIELDS], layout: { maxColumns: 1, blocks: [metric] } };
}

const THRESHOLDS: MetricBlock = { id: 'metric01', type: 'metric', heading: 'Damage thresholds', fields: ['major', 'severe'] };

function fileWith(block: Record<string, unknown>): Record<string, unknown> {
  return { format: TEMPLATE_FORMAT, version: 1, id: 'metric-abc123', fields: FIELDS, layout: { maxColumns: 1, blocks: [block] } };
}

describe('a Metric in a template file', () => {
  it('reads and writes back its heading and numbers, keys in the order id, type, heading, fields', () => {
    const result = parseTemplate(fileWith({ fields: ['major', 'severe'], heading: 'Damage thresholds', type: 'metric', id: 'metric01' }));
    expect(result.problems).toEqual([]);
    expect(result.template?.layout.blocks).toEqual([THRESHOLDS]);
    const written = serializeTemplate(result.template!);
    expect(JSON.parse(written).layout.blocks).toEqual([THRESHOLDS]);
    expect(Object.keys(JSON.parse(written).layout.blocks[0])).toEqual(['id', 'type', 'heading', 'fields']);
    expect(serializeTemplate(parseTemplate(written).template!)).toBe(written);
  });

  it('keeps a number not named yet, and keeps a Metric without numbers as it was read', () => {
    expect(parseTemplate(fileWith({ id: 'metric01', type: 'metric', fields: ['major', ''] })).template?.layout.blocks)
      .toEqual([{ id: 'metric01', type: 'metric', fields: ['major', ''] }]);
    for (const fields of [[], undefined, 'major']) {
      const result = parseTemplate(fileWith({ id: 'metric01', type: 'metric', fields }));
      expect(result.template?.layout.blocks[0]?.type).toBe('opaque');
      expect(result.problems).toEqual([expect.stringContaining('has no valid "fields"')]);
    }
  });

  it('reads a Value that still says it is boxed as a Value beside its label', () => {
    const result = parseTemplate(fileWith({ id: 'stat0001', type: 'stat', field: 'major', look: 'boxed' }));
    expect(result.template?.layout.blocks[0]).toMatchObject({ id: 'stat0001', type: 'stat', field: 'major', look: 'run-in' });
    expect(result.problems).toEqual([expect.stringContaining('"look" is "boxed", not run-in or stacked; "run-in" is used')]);
  });
});

describe('a Metric in the model', () => {
  it('is a tile of its own kind in the grid', () => {
    expect(tileKind(THRESHOLDS)).toBe('metric');
    expect(kindName(THRESHOLDS)).toBe('Metric');
    expect(templateGrid(templateWith(THRESHOLDS).layout).rows).toEqual([{ id: 'metric01', paired: false, tiles: [{ id: 'metric01', kind: 'metric' }] }]);
  });

  it('shows each of its numbers and is bound to its first named one', () => {
    expect(fieldsShownBy(THRESHOLDS)).toEqual(['major', 'severe']);
    expect(boundField({ ...THRESHOLDS, fields: ['', 'severe'] })).toBe('severe');
    expect(boundField({ ...THRESHOLDS, fields: [''] })).toBeUndefined();
  });

  it('follows a renamed key in the number that shows it', () => {
    const renamed = renameFieldKey(templateWith(THRESHOLDS), 'major', 'major_threshold');
    expect(metricBlock(renamed, 'metric01')?.fields).toEqual(['major_threshold', 'severe']);
  });

  it('adds numbers at its end, not named yet, up to six', () => {
    let template = templateWith(THRESHOLDS);
    for (let count = 3; count <= MAX_METRIC_NUMBERS; count++) {
      template = addMetricNumber(template, 'metric01');
      expect(metricBlock(template, 'metric01')?.fields).toHaveLength(count);
    }
    expect(metricBlock(template, 'metric01')?.fields.slice(2)).toEqual(['', '', '', '']);
    expect(canAddMetricNumber(template, 'metric01')).toBe(false);
    expect(addMetricNumber(template, 'metric01')).toBe(template);
  });

  it('takes a number out, never its last, and keeps the number\'s field in the template', () => {
    const template = templateWith(THRESHOLDS);
    const without = removeMetricNumber(template, 'metric01', 0);
    expect(metricBlock(without, 'metric01')?.fields).toEqual(['severe']);
    expect(without.fields).toEqual(template.fields);
    expect(removeMetricNumber(without, 'metric01', 0)).toBe(without);
    expect(removeMetricNumber(template, 'metric01', 5)).toBe(template);
    expect(removeMetricNumber(template, 'nothing1', 0)).toBe(template);
  });
});
