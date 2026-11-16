import { describe, expect, it } from 'vitest';
import { hasLevels, onLevel, placedOnViewedLevel, placedOnViewedLevels, resolveLevel, viewedLevelId } from '../../../src/app/levels/sceneLevels';
import type { SceneLevel } from '../../../src/app/types/sceneLevelTypes';

const level = (id: string, bottom: number): SceneLevel => ({ id, name: id, elevation: { bottom, top: bottom + 10 }, background: null });
const LEVELS = [level('ground', 0), level('upper', 10), level('roof', 20)];

describe('which level an object is on', () => {
  it('puts everything on the one level of a scene without levels', () => {
    expect(onLevel({ level: 'upper' }, 'anything', undefined)).toBe(true);
    expect(onLevel({ levels: ['upper'] }, 'anything', [level('only', 0)])).toBe(true);
  });

  it.each([
    ['an unset level', {}, 'ground'],
    ['a level the scene lacks', { level: 'cellar' }, 'ground'],
    ['a level that is no text', { level: 7 as unknown as string }, 'ground'],
    ['its own level', { level: 'upper' }, 'upper'],
  ])('reads %s of an object of one level', (_label, object, expected) => {
    expect(LEVELS.filter((candidate) => onLevel(object, candidate.id, LEVELS)).map((candidate) => candidate.id)).toEqual([expected]);
  });

  it.each([
    ['unset', {}, ['ground']],
    ['all', { levels: 'all' as const }, ['ground', 'upper', 'roof']],
    ['some', { levels: ['upper', 'roof'] }, ['upper', 'roof']],
    ['only levels the scene lacks', { levels: ['cellar'] }, ['ground']],
    ['empty', { levels: [] }, ['ground']],
    ['some known and some not', { levels: ['cellar', 'roof'] }, ['roof']],
  ])('reads the levels of a wall that names %s', (_label, object, expected) => {
    expect(LEVELS.filter((candidate) => onLevel(object, candidate.id, LEVELS)).map((candidate) => candidate.id)).toEqual(expected);
  });
});

describe('the level a view shows', () => {
  it('is its own where the scene has it, else the first, and none without levels', () => {
    expect(viewedLevelId({ levels: LEVELS, viewedLevel: 'roof' })).toBe('roof');
    expect(viewedLevelId({ levels: LEVELS, viewedLevel: 'gone' })).toBe('ground');
    expect(viewedLevelId({ levels: LEVELS })).toBe('ground');
    expect(viewedLevelId({ viewedLevel: 'roof' })).toBeNull();
    expect(resolveLevel(undefined, 'roof')).toBeNull();
    expect(hasLevels([level('only', 0)])).toBe(false);
  });

  it('places new objects on it only in a scene with several levels', () => {
    expect(placedOnViewedLevel({ levels: LEVELS, viewedLevel: 'upper' })).toEqual({ level: 'upper' });
    expect(placedOnViewedLevels({ levels: LEVELS, viewedLevel: 'upper' })).toEqual({ levels: ['upper'] });
    expect(placedOnViewedLevel({ levels: LEVELS })).toEqual({ level: 'ground' });
    expect(placedOnViewedLevel({ viewedLevel: 'upper' })).toEqual({});
    expect(placedOnViewedLevels({ levels: [level('only', 0)] })).toEqual({});
  });
});
