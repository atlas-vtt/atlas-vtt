import { blockVisibility, evaluateCondition } from '../../../../src/app/statblocks/expressions/conditions';
import type { Condition, FieldValue } from '../../../../src/app/statblocks/model/templateTypes';
import { readerFor, type ValueReader } from '../../../../src/app/statblocks/values/fieldValues';

const VALUES: Record<string, FieldValue> = {
  size: 'Large',
  hp: 52,
  ac: '14',
  cr: '1/4',
  speed: '30 ft.',
  zero: 0,
  off: false,
  on: 'true',
  blank: '  ',
  list: ['beast', 'Swarm'],
  empties: ['', null],
  legendary: { name: '', desc: '' },
};

const reader: ValueReader = readerFor(VALUES, [{ key: 'hp', formerKeys: ['hit_points'] }]);

function holds(condition: Condition): boolean {
  return evaluateCondition(condition, reader);
}

describe('evaluateCondition', () => {
  it('tells present from absent by emptiness', () => {
    expect(holds({ field: 'size', is: 'present' })).toBe(true);
    expect(holds({ field: 'zero', is: 'present' })).toBe(true);
    expect(holds({ field: 'off', is: 'present' })).toBe(true);
    for (const field of ['blank', 'empties', 'legendary', 'missing']) {
      expect(holds({ field, is: 'present' }), field).toBe(false);
      expect(holds({ field, is: 'absent' }), field).toBe(true);
    }
  });

  it('compares text in any case, numbers by value and yes/no by either spelling', () => {
    expect(holds({ field: 'size', is: 'equal', value: 'large' })).toBe(true);
    expect(holds({ field: 'size', is: 'not-equal', value: 'Huge' })).toBe(true);
    expect(holds({ field: 'ac', is: 'equal', value: 14 })).toBe(true);
    expect(holds({ field: 'hp', is: 'equal', value: '52' })).toBe(true);
    expect(holds({ field: 'cr', is: 'equal', value: 0.25 })).toBe(true);
    expect(holds({ field: 'speed', is: 'equal', value: 30 })).toBe(false);
    expect(holds({ field: 'off', is: 'equal', value: false })).toBe(true);
    expect(holds({ field: 'off', is: 'equal', value: 'no' })).toBe(true);
    expect(holds({ field: 'on', is: 'equal', value: true })).toBe(true);
    expect(holds({ field: 'list', is: 'equal', value: 'swarm' })).toBe(true);
    expect(holds({ field: 'list', is: 'not-equal', value: 'beast' })).toBe(false);
    expect(holds({ field: 'missing', is: 'equal', value: '' })).toBe(false);
    expect(holds({ field: 'missing', is: 'not-equal', value: 'x' })).toBe(true);
  });

  it('compares ratings above and below, never for empty values', () => {
    expect(holds({ field: 'hp', is: 'above', value: 50 })).toBe(true);
    expect(holds({ field: 'hp', is: 'below', value: 52 })).toBe(false);
    expect(holds({ field: 'cr', is: 'below', value: 1 })).toBe(true);
    expect(holds({ field: 'speed', is: 'above', value: 25 })).toBe(true);
    expect(holds({ field: 'missing', is: 'below', value: 100 })).toBe(false);
    expect(holds({ field: 'blank', is: 'above', value: -100 })).toBe(false);
  });

  it('reads fields through their former keys', () => {
    const renamed = readerFor({ hit_points: 7 }, [{ key: 'hp', formerKeys: ['hit_points'] }]);
    expect(evaluateCondition({ field: 'hp', is: 'below', value: 10 }, renamed)).toBe(true);
  });

  it('holds for a condition of a kind this Atlas does not know', () => {
    const newer = JSON.parse('{ "field": "hp", "is": "between", "value": [1, 2] }') as Condition;
    expect(holds(newer)).toBe(true);
  });
});

describe('blockVisibility', () => {
  it('shows a block while a field it shows has a value', () => {
    expect(blockVisibility({}, reader, ['missing', 'hp'])).toBe('show');
    expect(blockVisibility({}, reader, [])).toBe('show');
  });

  it('hides a block while every field it shows is empty', () => {
    expect(blockVisibility({}, reader, ['missing', 'blank'])).toBe('hide');
    expect(blockVisibility({ whenEmpty: 'hide', fallback: 'None' }, reader, ['missing'])).toBe('hide');
  });

  it('shows the fallback only with whenEmpty fallback and a fallback pattern', () => {
    expect(blockVisibility({ whenEmpty: 'fallback', fallback: 'None' }, reader, ['missing'])).toBe('fallback');
    expect(blockVisibility({ whenEmpty: 'fallback' }, reader, ['missing'])).toBe('hide');
    expect(blockVisibility({ whenEmpty: 'fallback', fallback: '  ' }, reader, ['missing'])).toBe('hide');
    expect(blockVisibility({ whenEmpty: 'fallback', fallback: 'None' }, reader, ['hp'])).toBe('show');
  });

  it('hides a block whose showWhen fails, whatever its values', () => {
    const showWhen: Condition = { field: 'size', is: 'equal', value: 'Huge' };
    expect(blockVisibility({ showWhen }, reader, ['hp'])).toBe('hide');
    expect(blockVisibility({ showWhen, whenEmpty: 'fallback', fallback: 'None' }, reader, ['missing'])).toBe('hide');
    expect(blockVisibility({ showWhen: { field: 'size', is: 'present' } }, reader, ['hp'])).toBe('show');
  });
});
