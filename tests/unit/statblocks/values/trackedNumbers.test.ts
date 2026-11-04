import { describe, expect, it } from 'vitest';
import { templateQuantityLook } from '../../../../src/app/resources/quantityLooks';
import { tokenQuantities } from '../../../../src/app/resources/statblockQuantities';
import { trackedResources } from '../../../../src/app/resources/trackedResources';
import { parseTemplate } from '../../../../src/app/statblocks/format/parseTemplate';
import { serializeTemplate } from '../../../../src/app/statblocks/format/templateFormat';
import { renameFieldKey } from '../../../../src/app/statblocks/model/fieldOps';
import type { StatblockTemplate, TemplateField } from '../../../../src/app/statblocks/model/templateTypes';
import { trackedMax, trackedNumbers, trackedValue } from '../../../../src/app/statblocks/values/trackedNumbers';
import { HP } from '../../../mocks/resourceFixtures';
import { templateOf } from '../render/sheetTestKit';

const FIELDS: TemplateField[] = [
  { key: 'name', label: 'Name', type: 'text' },
  { key: 'level', label: 'Level', type: 'number' },
  { key: 'luck', label: 'Luck', type: 'number', tracks: { counts: 'down' } },
  { key: 'hit-dice', label: 'Hit Dice', type: 'number', tracks: { counts: 'down', max: 'level' } },
  { key: 'stress', label: 'Stress', type: 'number' },
  { key: 'hp', label: 'HP', type: 'number' },
  { key: 'speed', label: 'Speed', type: 'text', tracks: { counts: 'down' } },
];
const TEMPLATE: StatblockTemplate = templateOf(FIELDS, [
  { id: 'metric01', type: 'metric', fields: ['luck', 'hit-dice'] },
  { id: 'track001', type: 'track', field: 'stress', look: 'boxes', counts: 'up' },
  { id: 'track002', type: 'track', field: 'hp', resource: 'hp', look: 'gauge', counts: 'down' },
]);

describe('tracked numbers', () => {
  const numbers = trackedNumbers(TEMPLATE);

  it('are the number fields that say so and those an unbound Track draws, never text or a Track a resource shows', () => {
    expect(numbers.map((number) => [number.key, number.counts, number.maxField])).toEqual([
      ['luck', 'down', 'luck'],
      ['hitdice', 'down', 'level'],
      ['stress', 'up', 'stress'],
    ]);
  });

  it('read their maximum from their own value or the field they name, a whole number above 0', () => {
    const read = (values: Record<string, unknown>) => (key: string) => values[key] as number | string | undefined;
    expect(trackedMax(numbers[0]!, read({ luck: '3.7' }))).toBe(3);
    expect(trackedMax(numbers[1]!, read({ level: 5, 'hit-dice': 1 }))).toBe(5);
    expect(trackedMax(numbers[0]!, read({ luck: 0 }))).toBeNull();
    expect(trackedMax(numbers[0]!, read({}))).toBeNull();
  });

  it('start full or empty, and keep what is held within the note\'s maximum', () => {
    expect(trackedValue(numbers[0]!, 3, undefined)).toEqual({ current: 3, max: 3 });
    expect(trackedValue(numbers[2]!, 6, undefined)).toEqual({ current: 0, max: 6 });
    expect(trackedValue(numbers[0]!, 3, { current: 5, max: 9 })).toEqual({ current: 3, max: 3 });
  });

  it('read a maximum named by no number field as their own value', () => {
    const dangling = templateOf([{ key: 'ki', label: 'Ki', type: 'number', tracks: { counts: 'down', max: 'gone' } }], []);
    expect(trackedNumbers(dangling)[0]?.maxField).toBe('ki');
  });

  it('are resources of no socket, except where a collection resource reads the field', () => {
    const tracked = trackedResources(TEMPLATE, [{ ...HP, key: 'luck-points', field: 'luck' }]);
    expect(tracked.map((each) => each.definition)).toEqual([
      { key: 'hitdice', name: 'Hit Dice', field: 'level', direction: 'drains', color: '#8a8a8a', visibleToPlayers: false },
      { key: 'stress', name: 'Stress', field: 'stress', direction: 'fills', color: '#8a8a8a', visibleToPlayers: false },
    ]);
  });

  it('are listed in the DM screen with the note\'s maximum and the token\'s current value', () => {
    const quantities = tokenQuantities({ luck: 3, level: 4, stress: 6 }, templateQuantityLook(TEMPLATE), { resources: { luck: { current: 1, max: 9 } } }, []);
    expect(quantities.slice(0, 3)).toEqual([
      { key: 'luck', label: 'Luck', value: { current: 1, max: 3 }, fills: false, boxes: false },
      { key: 'hitdice', label: 'Hit Dice', value: { current: 4, max: 4 }, fills: false, boxes: false },
      { key: 'stress', label: 'Stress', value: { current: 0, max: 6 }, fills: true, boxes: true },
    ]);
  });
});

describe('the tracks key of a template file', () => {
  const read = (text: string): StatblockTemplate => {
    const result = parseTemplate(text);
    if (result.template === null) throw new Error(result.problems.join(' '));
    return result.template;
  };

  it('is written and read back as it was, its keys in order', () => {
    const text = serializeTemplate(TEMPLATE);
    expect(read(text).fields.find((field) => field.key === 'hit-dice')?.tracks).toEqual({ counts: 'down', max: 'level' });
    expect(text).toContain('"tracks": {\n        "counts": "down",\n        "max": "level"\n      }');
    expect(serializeTemplate(read(text))).toBe(text);
  });

  it('reads a direction it does not know as counting down, says so, and writes it back as the file had it', () => {
    const ki = templateOf([{ key: 'ki', label: 'Ki', type: 'number', tracks: { counts: 'up' } }], []);
    const result = parseTemplate(serializeTemplate(ki).replace('"up"', '"sideways"'));
    expect(result.template?.fields[0]?.tracks?.counts).toBe('down');
    expect(result.problems.join(' ')).toMatch(/down or up/);
    expect(serializeTemplate(result.template!)).toContain('"counts": "sideways"');
  });

  it('follows a rename of the field that holds the maximum', () => {
    const renamed = renameFieldKey(TEMPLATE, 'level', 'lvl');
    expect(renamed.fields.find((field) => field.key === 'hit-dice')?.tracks).toEqual({ counts: 'down', max: 'lvl' });
    expect(renameFieldKey(TEMPLATE, 'luck', 'fortune').fields.find((field) => field.key === 'fortune')?.tracks).toEqual({ counts: 'down' });
  });
});
