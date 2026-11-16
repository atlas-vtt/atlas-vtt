import { describe, expect, it } from 'vitest';
import { objectsMovedWithMap } from '../../../src/app/grid/mapStretchObjects';
import { movesWithFrame } from '../../../src/app/levels/levelAlignment';
import { levelsCarriedWithGrid, type GridCarryScene } from '../../../src/app/levels/levelGridCarry';
import { movesWithLevel } from '../../../src/app/levels/sceneLevels';
import type { GridState } from '../../../src/app/types/gridTypes';
import type { LevelLink, SceneLevel } from '../../../src/app/types/sceneLevelTypes';
import type { WallSegment } from '../../../src/app/types/wallTypes';

const level = (id: string): SceneLevel => ({ id, name: id, elevation: { bottom: 0, top: 10 }, background: null });
const GRID: GridState = { enabled: true, visible: true, type: 'square', size: 70, offsetX: 5, offsetY: 5, opacity: 0.5 };
const AREA = [{ x: 140, y: 140 }, { x: 210, y: 140 }, { x: 210, y: 210 }, { x: 140, y: 210 }];
const stairs = (id: string, levels: string[]): LevelLink => ({ id, kind: 'level-link', polygon: AREA, levels });
/** A wall along the stairs' first edge, on the same levels: the stairs must move as it does. */
const wall = (id: string, levels: string[]): WallSegment => ({ id, p1: AREA[0]!, p2: AREA[1]!, levels } as WallSegment);

/** Ground is drawn in the frame; upper and roof are fitted, each by an alignment of its own. */
function scene(): GridCarryScene {
  return {
    levels: [level('ground'), level('upper'), level('roof')],
    grid: GRID,
    levelAlignments: {
      upper: { offset: { x: 61, y: 47 }, scale: 1.4, stretch: { x: 1, y: 1 } },
      roof: { offset: { x: 12, y: 30 }, scale: 0.8, stretch: { x: 1, y: 1 } },
    },
    objects: {
      tokens: {}, fog: {}, pins: {}, texts: {}, drawings: {}, lights: {}, audios: {},
      levelLinks: { fitted: stairs('fitted', ['upper', 'roof']), framed: stairs('framed', ['ground', 'upper']) },
      walls: { fitted: wall('fitted', ['upper', 'roof']), framed: wall('framed', ['ground', 'upper']) },
    },
  };
}

type Objects = GridCarryScene['objects'];

/** Each stairs' first edge, and the wall on the same levels beside it. */
function edges(objects: Objects, id: string): { stairs: unknown; wall: unknown } {
  const link = objects.levelLinks![id]!;
  const { p1, p2 } = objects.walls[id]!;
  return { stairs: [link.polygon[0], link.polygon[1]], wall: [p1, p2] };
}

const double = (point: { x: number; y: number }): { x: number; y: number } => ({ x: point.x * 2, y: point.y * 2 });

describe('stairs joining floors aligned on their own', () => {
  it('stay where they are when one of their fitted floors is fitted again, as a wall of both does', () => {
    const before = scene();
    const after = objectsMovedWithMap(before.objects, double, movesWithLevel(before, 'upper'));
    for (const id of ['fitted', 'framed']) {
      expect(after.levelLinks![id]!.polygon).toEqual(AREA);
      expect(edges(after, id).stairs).toEqual(edges(after, id).wall);
    }
  });

  it('take the grid\'s own move when only fitted floors join them, and stay with the frame otherwise', () => {
    const before = scene();
    const carried = levelsCarriedWithGrid(before, { ...GRID, size: 84, offsetX: 20 })!;
    expect(carried.objects.levelLinks!.fitted!.polygon).not.toEqual(AREA);
    expect(carried.objects.levelLinks!.framed!.polygon).toEqual(AREA);
    for (const id of ['fitted', 'framed']) expect(edges(carried.objects, id).stairs).toEqual(edges(carried.objects, id).wall);
  });

  it('follow the frame\'s map when the scene\'s grid is aligned anew, where one of their floors is drawn in it', () => {
    const before = scene();
    const after = objectsMovedWithMap(before.objects, double, movesWithFrame(before));
    expect(after.levelLinks!.framed!.polygon).toEqual(AREA.map(double));
    expect(after.levelLinks!.fitted!.polygon).toEqual(AREA);
    for (const id of ['fitted', 'framed']) expect(edges(after, id).stairs).toEqual(edges(after, id).wall);
  });
});
