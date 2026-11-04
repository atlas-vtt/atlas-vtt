import { describe, expect, it } from 'vitest';
import { meaningsOf, withFormerKeysAliased } from '../../../../src/app/statblocks/resolve/fieldMeanings';
import type { TemplateField } from '../../../../src/app/statblocks/model/templateTypes';

const field = (key: string, extra: Partial<TemplateField> = {}): TemplateField => ({ key, label: key, type: 'text', ...extra });

describe('meaningsOf', () => {
  it('points each meaning at the first field that carries it', () => {
    expect(meaningsOf([field('vigour', { meaning: 'hit-points' }), field('hp', { meaning: 'hit-points' }), field('kind', { meaning: 'creature-type' })]))
      .toEqual({ 'hit-points': 'vigour', 'creature-type': 'kind' });
  });

  it('gives one shared empty record where no field means anything', () => {
    expect(meaningsOf([field('name')])).toBe(meaningsOf([]));
    expect(Object.isFrozen(meaningsOf([]))).toBe(true);
  });
});

describe('withFormerKeysAliased', () => {
  const hp = field('hp', { formerKeys: ['hit_points', 'health'] });

  it('adds the current key from the newest former key that holds a value', () => {
    expect(withFormerKeysAliased({ health: 9, hit_points: 22 }, [hp])).toEqual({ hp: 22, health: 9, hit_points: 22 });
    expect(withFormerKeysAliased({ health: 9 }, [hp])).toEqual({ hp: 9, health: 9 });
  });

  it('counts an empty value under the current key as present', () => {
    expect(withFormerKeysAliased({ hp: null, health: 9 }, [hp])).toEqual({ hp: null, health: 9 });
  });

  it('returns the same record when nothing needs an alias', () => {
    const record = { hp: 3, hit_points: 22 };
    expect(withFormerKeysAliased(record, [hp, field('name')])).toBe(record);
    expect(withFormerKeysAliased(record, [])).toBe(record);
  });
});
