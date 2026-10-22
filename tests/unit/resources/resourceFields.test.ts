import { describe, expect, it } from 'vitest';
import { discoverResourceFields, isHitPointsKey, parseResourceValue, resolveField } from '../../../src/app/resources/resourceFields';

describe('resource fields', () => {
  it('reads dotted paths into objects and lists', () => {
    const creature = { hp: 8, stats: [13, 16, 12], resources: { mana: '5/10' } };
    expect(resolveField(creature, 'hp')).toBe(8);
    expect(resolveField(creature, 'stats.0')).toBe(13);
    expect(resolveField(creature, 'resources.mana')).toBe('5/10');
    expect(resolveField(creature, 'stats.9')).toBeUndefined();
    expect(resolveField(creature, 'missing.path')).toBeUndefined();
    expect(resolveField(creature, '')).toBeUndefined();
  });

  it('finds a field whatever its spelling, and hit points under their usual names', () => {
    expect(resolveField({ HP: 3 }, 'hp')).toBe(3);
    expect(resolveField({ 'Hit Points': 9 }, 'hp')).toBe(9);
    expect(resolveField({ Health: { current: 12, max: 27 } }, 'hp')).toEqual({ current: 12, max: 27 });
    expect(resolveField({ max_stress: 6 }, 'Max Stress')).toBe(6);
    expect(resolveField({ health: 5, hp: 8 }, 'hp')).toBe(8);
    expect(resolveField({ hp: 8 }, 'stress')).toBeUndefined();
  });

  it('recognises the usual names of hit points', () => {
    expect(['hp', 'HP', 'Hit Points:', 'hit_points', 'Health'].map(isHitPointsKey)).not.toContain(false);
    expect(['Hit Dice', 'hope', 'AC', ''].map(isHitPointsKey)).not.toContain(true);
  });

  it('parses concrete quantities only', () => {
    expect(parseResourceValue(8)).toEqual({ current: 8, max: 8 });
    expect(parseResourceValue('5/10')).toEqual({ current: 5, max: 10 });
    expect(parseResourceValue('22 (4d8+4)')).toEqual({ current: 22, max: 22 });
    expect(parseResourceValue({ current: 3, max: 6 })).toEqual({ current: 3, max: 6 });
    expect(parseResourceValue('2d6')).toBeNull();
    expect(parseResourceValue('lots')).toBeNull();
    expect(parseResourceValue(-1)).toBeNull();
  });

  it('reads a number followed by a note in brackets as that number', () => {
    expect(parseResourceValue('15 (natural armor)')).toEqual({ current: 15, max: 15 });
    expect(parseResourceValue('18 (plate armor, shield)')).toEqual({ current: 18, max: 18 });
    expect(parseResourceValue('45 (6d10 + 12)')).toEqual({ current: 45, max: 45 });
    expect(parseResourceValue('plate armor')).toBeNull();
    expect(parseResourceValue('(natural armor) 15')).toBeNull();
  });

  it('discovers quantity fields for autocomplete', () => {
    expect(discoverResourceFields([{ name: 'Troll', hp: 14, stats: [14, 12, 4], attacks: 'bite (d10)' }, { hp: 3, stress: '2/6' }]))
      .toEqual(['hp', 'stats.0', 'stats.1', 'stats.2', 'stress']);
  });

  it('leaves out the bookkeeping fields statblock notes carry', () => {
    expect(discoverResourceFields([{ hp: 14, mtime: 1790000000000, columns: 2 }])).toEqual(['hp']);
  });
});
