import { describe, expect, it } from 'vitest';
import { asKeptWalls, keepSceneWalls, sameData } from '../../src/app/services/keptSceneWalls';
import type { WallSegment } from '../../src/app/types/wallTypes';

const wall = (id: string, x: number): WallSegment => ({ id, kind: 'wall', type: 'solid', p1: { x, y: 0 }, p2: { x, y: 100 } });
const record = (...walls: WallSegment[]): Record<string, WallSegment> => Object.fromEntries(walls.map((w) => [w.id, w]));
/** The record as a scene file gives it back: the same data in new objects. */
const reread = (walls: Record<string, WallSegment>): Record<string, WallSegment> => JSON.parse(JSON.stringify(walls)) as Record<string, WallSegment>;

describe('keptSceneWalls', () => {
  it('gives back the kept record for a scene whose file holds the same walls', () => {
    const kept = record(wall('a', 1), wall('b', 2));
    keepSceneWalls('scene.atlasmap', kept);
    expect(asKeptWalls('scene.atlasmap', reread(kept))).toBe(kept);
  });

  it('keeps what the file holds when any wall differs, or the scene is another', () => {
    const kept = record(wall('a', 1), wall('b', 2));
    keepSceneWalls('one.atlasmap', kept);
    const moved = record(wall('a', 1), wall('b', 3));
    expect(asKeptWalls('one.atlasmap', moved)).toBe(moved);
    const doored = reread(kept);
    doored.b = { ...doored.b!, type: 'door', closed: true };
    expect(asKeptWalls('one.atlasmap', doored)).toBe(doored);
    const other = reread(kept);
    expect(asKeptWalls('two.atlasmap', other)).toBe(other);
  });

  it('counts the order of walls and fields, and tells -0 from 0', () => {
    expect(sameData(record(wall('a', 1), wall('b', 2)), record(wall('b', 2), wall('a', 1)))).toBe(false);
    expect(sameData({ x: 1, y: 2 }, { y: 2, x: 1 })).toBe(false);
    expect(sameData({ x: -0 }, { x: 0 })).toBe(false);
    expect(sameData({ x: undefined }, {})).toBe(false);
    expect(sameData([1, 2], { 0: 1, 1: 2 })).toBe(false);
    expect(sameData({ p: [{ x: 1 }], levels: ['l'] }, { p: [{ x: 1 }], levels: ['l'] })).toBe(true);
  });

  it('keeps the scenes used last', () => {
    const first = record(wall('a', 1));
    keepSceneWalls('first.atlasmap', first);
    for (let i = 0; i < 4; i++) keepSceneWalls(`later-${i}.atlasmap`, record(wall('a', i)));
    const again = reread(first);
    expect(asKeptWalls('first.atlasmap', again)).toBe(again);
  });
});
