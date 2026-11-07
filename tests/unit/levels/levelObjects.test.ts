import { describe, expect, it } from 'vitest';
import { levelObjects, type SceneObjects } from '../../../src/app/levels/levelObjects';
import type { SceneLevel } from '../../../src/app/types/sceneLevelTypes';
import type { TokenEntity } from '../../../src/app/types';
import type { WallSegment } from '../../../src/app/types/wallTypes';

const LEVELS: SceneLevel[] = [
  { id: 'ground', name: 'Ground', elevation: { bottom: 0, top: 10 }, background: null },
  { id: 'upper', name: 'Upper', elevation: { bottom: 10, top: 20 }, background: null },
];

const token = (id: string, level?: string): TokenEntity => ({ id, kind: 'token', x: 0, y: 0, imagePath: 't.png', ...(level ? { level } : {}) });
const wall = (id: string, levels?: WallSegment['levels']): WallSegment => ({ id, kind: 'wall', type: 'solid', p1: { x: 0, y: 0 }, p2: { x: 1, y: 0 }, ...(levels ? { levels } : {}) });

function objects(): SceneObjects {
  return {
    tokens: { a: token('a'), b: token('b', 'upper') },
    walls: { outer: wall('outer', 'all'), up: wall('up', ['upper']) },
    fog: {}, pins: {}, texts: {}, drawings: {}, lights: {}, audios: {},
  };
}

describe('the objects a view shows', () => {
  it('are all of them in a scene without levels', () => {
    const all = objects();
    expect(levelObjects({ objects: all })).toBe(all);
    expect(levelObjects({ objects: all, levels: [LEVELS[0]!], viewedLevel: 'upper' })).toBe(all);
  });

  it('are those on the level the view shows', () => {
    const all = objects();

    const ground = levelObjects({ objects: all, levels: LEVELS, viewedLevel: 'ground' });
    const upper = levelObjects({ objects: all, levels: LEVELS, viewedLevel: 'upper' });

    expect(Object.keys(ground.tokens)).toEqual(['a']);
    expect(Object.keys(ground.walls)).toEqual(['outer']);
    expect(Object.keys(upper.tokens)).toEqual(['b']);
    expect(Object.keys(upper.walls)).toEqual(['outer', 'up']);
    // A kind with nothing on another level is the record itself
    expect(upper.walls).toBe(all.walls);
    expect(levelObjects({ objects: all, levels: LEVELS })).toBe(ground);
  });

  it('keep their records while a write changes only another level', () => {
    const all = objects();
    const before = levelObjects({ objects: all, levels: LEVELS, viewedLevel: 'ground' });

    const moved: SceneObjects = { ...all, tokens: { ...all.tokens, b: { ...all.tokens.b!, x: 50 } } };
    const after = levelObjects({ objects: moved, levels: LEVELS, viewedLevel: 'ground' });

    expect(after).toBe(before);
  });

  it('change only the records of the kinds that changed on the level', () => {
    const all = objects();
    const before = levelObjects({ objects: all, levels: LEVELS, viewedLevel: 'upper' });

    const moved: SceneObjects = { ...all, tokens: { ...all.tokens, b: { ...all.tokens.b!, x: 50 } } };
    const after = levelObjects({ objects: moved, levels: LEVELS, viewedLevel: 'upper' });

    expect(after).not.toBe(before);
    expect(after.tokens.b?.x).toBe(50);
    expect(after.walls).toBe(before.walls);
    expect(after.fog).toBe(before.fog);
  });

  it('leave out an entry that is no object, except on the first level', () => {
    const all: SceneObjects = { ...objects(), walls: { broken: 'not a wall' as unknown as WallSegment } };

    expect(Object.keys(levelObjects({ objects: all, levels: LEVELS, viewedLevel: 'ground' }).walls)).toEqual(['broken']);
    expect(Object.keys(levelObjects({ objects: all, levels: LEVELS, viewedLevel: 'upper' }).walls)).toEqual([]);
  });
});
