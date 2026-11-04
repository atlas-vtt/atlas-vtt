import { describe, expect, it } from 'vitest';
import { conditionMetrics, metricKey, numberFields, numberSpotId, sheetMetrics } from '../../../../src/app/recovery/editor/recoveryMetrics';
import type { StatblockTemplate } from '../../../../src/app/statblocks/model/templateTypes';
import { ADVENTURER, CONDITIONS, RESOURCES } from '../../../fixtures/recoveryFixtures';

describe('the metrics of a card', () => {
  const { metrics, bySpot, refused } = sheetMetrics(ADVENTURER, RESOURCES);

  it('finds the resources by the fields their blocks show, the header first, and every Counters block', () => {
    expect(metrics.map((metric) => [metric.blockId, metricKey(metric.target), metric.label])).toEqual([
      ['header-hp', 'resource:hp', 'HP'],
      ['track001', 'resource:stress', 'Stress'],
      ['countr01', 'counters:hit_dice', 'Hit Dice'],
      ['countr02', 'counters:features', 'Features'],
    ]);
    expect(bySpot.get('countr02')?.target).toEqual({ kind: 'counters', field: 'features', rows: 'all' });
  });

  it('refuses numbers no resource reads, and a static value', () => {
    expect([...refused].sort()).toEqual(['statac01', 'statcn01']);
  });

  it('reads a dotted resource field by its first key', () => {
    const scores = sheetMetrics(ADVENTURER, [{ ...RESOURCES[1]!, key: 'grit', field: 'con.0' }]);
    expect(scores.metrics.map((metric) => metric.blockId)).toEqual(['statcn01', 'countr01', 'countr02']);
  });

  it('offers each number of a Metric on its own: a tracked one as its own resource, the others refused', () => {
    const template: StatblockTemplate = {
      ...ADVENTURER,
      fields: [...ADVENTURER.fields, { key: 'luck', label: 'Luck', type: 'number', tracks: { counts: 'down' } }],
      layout: { ...ADVENTURER.layout, blocks: [{ id: 'metric01', type: 'metric', fields: ['luck', 'con'] }] },
    };
    const { metrics: shown, refused: left } = sheetMetrics(template, RESOURCES);
    expect(shown.map((metric) => [metric.spotId, metric.blockId, metricKey(metric.target), metric.label])).toContainEqual(
      [numberSpotId('metric01', 'luck'), 'metric01', 'resource:luck', 'Luck'],
    );
    expect([...left]).toContain(numberSpotId('metric01', 'con'));
  });

  it('keeps a number a collection resource reads that resource, though the template tracks it', () => {
    const template: StatblockTemplate = { ...ADVENTURER, fields: ADVENTURER.fields.map((field) => (field.key === 'stress' ? { ...field, tracks: { counts: 'up' } } : field)) };
    expect(sheetMetrics(template, RESOURCES).metrics.find((metric) => metric.blockId === 'track001')?.target).toEqual({ kind: 'resource', field: 'stress' });
  });

  it('offers a Track bound to a resource by the path that resource reads, where its own field is no resource', () => {
    const bound: StatblockTemplate = { ...ADVENTURER, layout: { ...ADVENTURER.layout, blocks: [{ id: 'track002', type: 'track', field: 'speed', resource: 'hp', look: 'boxes', counts: 'down' }] } };
    expect(sheetMetrics(bound, RESOURCES).metrics.find((metric) => metric.blockId === 'track002')?.target).toEqual({ kind: 'resource', field: 'hp' });
  });

  it('offers the valued conditions only', () => {
    expect(conditionMetrics(CONDITIONS).map((chip) => chip.label)).toEqual(['Exhaustion', 'Frightened']);
  });

  it('names the number fields a formula may use', () => {
    expect(numberFields(ADVENTURER).map((field) => field.key)).toEqual(['level', 'hp', 'ac', 'con', 'stress']);
  });
});
