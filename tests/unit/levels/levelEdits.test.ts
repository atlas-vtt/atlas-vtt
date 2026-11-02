import { describe, expect, it } from 'vitest';
import { levelBackground, withLevelAdded, withLevelChanged, withLevelDeleted, withLevelsReordered, type LevelScene } from '../../../src/app/levels/levelEdits';
import { readSceneLevels } from '../../../src/app/levels/levelFile';
import { levelLabel } from '../../../src/app/react/components/levels/levelEditing';
import { onLevel } from '../../../src/app/levels/sceneLevels';
import type { SceneLevel } from '../../../src/app/types/sceneLevelTypes';
import type { TokenEntity } from '../../../src/app/types';
import type { WallSegment } from '../../../src/app/types/wallTypes';

const MASK_GROUND = 'data:image/png;base64,R1JPVU5E';
const MASK_UPPER = 'data:image/png;base64,VVBQRVI=';

const level = (id: string, background: string | null): SceneLevel => ({ id, name: id, elevation: { bottom: 0, top: 10 }, background });
const token = (id: string, onLevelId?: string): TokenEntity => ({ id, kind: 'token', x: 0, y: 0, imagePath: 't.png', ...(onLevelId ? { level: onLevelId } : {}) });
const wall = (id: string, levels?: WallSegment['levels']): WallSegment => ({ id, kind: 'wall', type: 'solid', p1: { x: 0, y: 0 }, p2: { x: 1, y: 0 }, ...(levels ? { levels } : {}) });

function scene(): LevelScene {
  return {
    levels: [level('ground', 'ground.png'), level('upper', 'upper.png')],
    background: 'ground.png',
    exploredMask: MASK_GROUND,
    exploredMasks: { upper: MASK_UPPER },
    objects: {
      tokens: { a: token('a'), b: token('b', 'upper') },
      fog: {}, pins: {}, texts: {}, drawings: {}, lights: {}, audios: {},
      walls: { outer: wall('outer', 'all'), both: wall('both', ['ground', 'upper']), up: wall('up', ['upper']), plain: wall('plain') },
    },
  };
}

const levelsOf = (edited: LevelScene, id: string, kind: 'tokens' | 'walls'): string[] => {
  const object = edited.objects[kind][id];
  return object ? (edited.levels ?? []).filter((candidate) => onLevel(object, candidate.id, edited.levels)).map((candidate) => candidate.id) : [];
};

describe('adding a level', () => {
  it('gives a scene without levels its first level, which holds the scene\'s map, and stacks the new one on top', () => {
    const levels = withLevelAdded({ levels: undefined, background: 'map.png' }, { name: 'Upper', background: 'upper.png' }, 'Ground floor');

    expect(levels.map((entry) => [entry.name, entry.background, entry.elevation])).toEqual([
      ['Ground floor', 'map.png', { bottom: 0, top: 10 }],
      ['Upper', 'upper.png', { bottom: 10, top: 20 }],
    ]);
  });
});

describe('reordering levels', () => {
  it('keeps everything on its level when another level becomes the first, background and memory included', () => {
    const before = scene();
    const after = withLevelsReordered(before, ['upper', 'ground']);

    expect(after.levels?.map((entry) => entry.id)).toEqual(['upper', 'ground']);
    expect(after.background).toBe('upper.png');
    expect(levelBackground(after, 'ground')).toBe('ground.png');
    expect(after.exploredMask).toBe(MASK_UPPER);
    expect(after.exploredMasks).toEqual({ ground: MASK_GROUND });
    expect(levelsOf(after, 'a', 'tokens')).toEqual(['ground']);
    expect(levelsOf(after, 'b', 'tokens')).toEqual(['upper']);
    expect(levelsOf(after, 'plain', 'walls')).toEqual(['ground']);
    expect(levelsOf(after, 'outer', 'walls')).toEqual(['upper', 'ground']);
    // What named its levels already is the same object
    expect(after.objects.tokens.b).toBe(before.objects.tokens.b);
  });

  it('changes no object while the first level stays', () => {
    const before = { ...scene(), levels: [...scene().levels!, level('roof', null)] };
    const after = withLevelsReordered(before, ['ground', 'roof', 'upper']);

    expect(after.objects).toBe(before.objects);
    expect(after.background).toBe('ground.png');
  });
});

describe('deleting a level', () => {
  it('moves its objects to the level chosen; what is on other levels too stays there', () => {
    const after = withLevelDeleted(scene(), 'upper', 'ground');

    expect(after.levels?.map((entry) => entry.id)).toEqual(['ground']);
    expect(after.exploredMasks).toBeUndefined();
    expect(Object.keys(after.objects.tokens)).toEqual(['a', 'b']);
    expect(after.objects.tokens.b?.level).toBe('ground');
    expect(after.objects.walls.up?.levels).toEqual(['ground']);
    expect(after.objects.walls.both?.levels).toEqual(['ground']);
  });

  it('deletes its objects with it, and the first level\'s map and memory pass to the next', () => {
    const after = withLevelDeleted(scene(), 'ground', null);

    expect(after.background).toBe('upper.png');
    expect(after.exploredMask).toBe(MASK_UPPER);
    expect(Object.keys(after.objects.tokens)).toEqual(['b']);
    expect(Object.keys(after.objects.walls)).toEqual(['outer', 'both', 'up']);
    expect(after.objects.walls.both?.levels).toEqual(['upper']);
    expect(after.objects.walls.outer?.levels).toBe('all');
  });

  it('never deletes the last level', () => {
    const only = { ...scene(), levels: [level('ground', 'ground.png')] };
    expect(withLevelDeleted(only, 'ground', null)).toBe(only);
  });
});

describe('naming a level', () => {
  it('keeps no name for a blank one, so the level is named by its place on every surface', () => {
    const levels = [level('ground', 'ground.png'), level('upper', 'upper.png')];

    const renamed = withLevelChanged(levels, 'upper', { name: '   ' });

    expect(renamed[1]).not.toHaveProperty('name');
    expect(levelLabel(renamed, renamed[1]!)).toBe('Level 2');
    expect(withLevelChanged(renamed, 'upper', { name: 'Roof' })[1]?.name).toBe('Roof');
  });

  it('reads a blank name in a file as none', () => {
    const [ground, upper] = readSceneLevels([{ id: 'ground', name: 'Ground' }, { id: 'upper', name: '' }], null);

    expect(ground?.name).toBe('Ground');
    expect(upper).not.toHaveProperty('name');
  });
});
