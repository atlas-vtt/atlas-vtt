import { expect, it } from 'vitest';
import { generateDungeon } from '../../../src/app/dungeons/generate';
import { dungeonScene } from '../../../src/app/dungeons/scene/toScene';
import { mapLayout } from '../../../src/app/dungeons/render/layoutSize';
import { DEFAULT_VIEW } from '../../../src/app/dungeons/style';
import { dungeonStyle } from '../../../src/app/dungeons/styleCatalog';
import { connectionProblems, stairProblems } from './floorsInvariants';

it('keeps tactical woods above connected cave floors, including rivers and scene features', () => {
  for (const seed of [21, 33, 47]) {
    const model = generateDungeon({ seed, theme: 'forest', tags: ['medium', 'wet'], floors: 3, roomScale: 'tactical' });
    expect(model.floors[0]!.forest).toBe(true);
    expect(model.floors[0]!.rivers).toBeDefined();
    expect(model.floors.slice(1).every(floor => !floor.forest && floor.cave)).toBe(true);
    expect(connectionProblems(model)).toEqual([]);
    expect(stairProblems(model)).toEqual([]);
    const layout = mapLayout(model, 70);
    const parts = dungeonScene(model, dungeonStyle('crayon'), DEFAULT_VIEW,
      { originCell: layout.originCell, pxPerCell: 70 },
      { width: layout.widthPx, height: layout.heightPx }, { unitType: 'feet', ruleDistance: 5 });
    expect(parts).not.toBeNull();
    expect(Object.keys(parts!.scene.walls ?? {}).length).toBeGreaterThan(0);
    expect(Object.keys(parts!.scene.mapFeatures ?? {}).length).toBeGreaterThan(0);
  }
}, 30_000);

it('keeps dry tactical forests dry and excludes cave-only hazards and secret entrances', () => {
  const model = generateDungeon({ seed: 47, theme: 'forest', tags: ['dry', 'lava', 'acid', 'secret'], floors: 1, fiveRoom: true, roomScale: 'tactical' });
  const floor = model.floors[0]!;
  expect(floor.rivers).toBeUndefined();
  expect(floor.doors.filter(door => door.kind === 'secret' || door.kind === 'steps')).toEqual([]);
  expect(model.tags).not.toContain('lava');
  expect(model.tags).not.toContain('acid');
  expect(floor.terrain.filter(piece => piece.traits.hazard === 'lava' || piece.traits.hazard === 'acid')).toEqual([]);
});
