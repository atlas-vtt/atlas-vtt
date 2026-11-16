import { describe, expect, it } from 'vitest';
import { levelsForFile, readExploredMasks, readSceneLevels, sceneFileVersion } from '../../../src/app/levels/levelFile';
import type { SceneLevel } from '../../../src/app/types/sceneLevelTypes';

const MASK = 'data:image/png;base64,AAAA';

describe('reading a scene file\'s levels', () => {
  it('reads none where the file has none', () => {
    expect(readSceneLevels(undefined, 'map.png')).toBeUndefined();
    expect(readSceneLevels({ ground: {} }, 'map.png')).toBeUndefined();
    expect(readSceneLevels([null, { name: 'no id' }], 'map.png')).toBeUndefined();
  });

  it('leaves out what names no level or repeats an id, and gives the first level the scene\'s background', () => {
    const levels = readSceneLevels([
      { id: 'ground', name: 'Ground', elevation: { bottom: 0, top: 10 }, background: 'old.png' },
      'nonsense',
      { id: 'ground', name: 'Again', elevation: { bottom: 0, top: 10 }, background: null },
      { id: 'upper', name: 'Upper', elevation: { bottom: 10, top: 20 }, background: 'upper.png' },
    ], 'map.png');

    expect(levels?.map((level) => [level.id, level.name, level.background])).toEqual([['ground', 'Ground', 'map.png'], ['upper', 'Upper', 'upper.png']]);
  });

  it('reads what is broken as the defaults and keeps fields it does not know', () => {
    const [read] = readSceneLevels([{ id: 'a', name: 3, elevation: { bottom: 5, top: 2 }, background: '', sees: ['b', 4], offset: { x: 'no' }, future: { kept: true } }], null)!;

    expect(read).toEqual({ id: 'a', elevation: { bottom: 5, top: 5 }, background: null, sees: ['b'], future: { kept: true } });
  });

  it('reads the explored memories of the levels above the first only', () => {
    const levels: SceneLevel[] = [
      { id: 'ground', name: 'Ground', elevation: { bottom: 0, top: 10 }, background: null },
      { id: 'upper', name: 'Upper', elevation: { bottom: 10, top: 20 }, background: null },
    ];

    expect(readExploredMasks({ ground: MASK, upper: MASK, gone: MASK }, levels)).toEqual({ upper: MASK });
    expect(readExploredMasks({ upper: 'not a png' }, levels)).toBeUndefined();
    expect(readExploredMasks({ upper: MASK }, undefined)).toBeUndefined();
  });
});

describe('writing a scene file\'s levels', () => {
  const levels: SceneLevel[] = [
    { id: 'ground', name: 'Ground', elevation: { bottom: 0, top: 10 }, background: 'stale.png' },
    { id: 'upper', name: 'Upper', elevation: { bottom: 10, top: 20 }, background: null },
  ];

  it('writes the scene\'s background as the first level\'s, the same copy each time', () => {
    const written = levelsForFile(levels, 'map.png');

    expect(written?.[0]?.background).toBe('map.png');
    expect(levelsForFile(levels, 'map.png')).toBe(written);
    expect(levelsForFile(written, 'map.png')).toBe(written);
  });

  it('gives a scene of several levels version 5 and every other scene version 4', () => {
    expect(sceneFileVersion(levels)).toBe(5);
    expect(sceneFileVersion([levels[0]])).toBe(4);
    expect(sceneFileVersion(undefined)).toBe(4);
  });
});
