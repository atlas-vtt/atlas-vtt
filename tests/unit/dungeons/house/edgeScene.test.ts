import { describe, expect, it } from 'vitest';
import { blocksNothing, concerns, stopsNothing } from '../../../../src/app/lighting/segments';
import { readWall } from '../../../../src/app/lighting/lightingObjects';
import { sealedWalls } from '../../../../src/app/lighting/sealWalls';
import { OUTER_WALL, windowSpan } from '../../../../src/app/dungeons/render/houseShapes';
import { dungeonWalls, type DungeonPlacement } from '../../../../src/app/dungeons/scene/toWalls';
import { DEFAULT_VIEW } from '../../../../src/app/dungeons/style';
import { dungeonStyle } from '../../../../src/app/dungeons/styleCatalog';
import type { WallSegment } from '../../../../src/app/types/wallTypes';
import { edgeHouse } from './edgeFixtures';

const PLACEMENT: DungeonPlacement = { originCell: { x: -2, y: -2 }, pxPerCell: 100 };
const cell = (p: { x: number; y: number }): { x: number; y: number } => ({ x: p.x / 100 - 2, y: p.y / 100 - 2 });

function wallsOf(look = 'parchment'): WallSegment[] {
  return Object.values(dungeonWalls(edgeHouse(), dungeonStyle(look), DEFAULT_VIEW, PLACEMENT).walls);
}

const middle = (wall: WallSegment): { x: number; y: number } => cell({ x: (wall.p1.x + wall.p2.x) / 2, y: (wall.p1.y + wall.p2.y) / 2 });

/** Whether the segment passes through the open middle of a rectangle of cells (its walls' half left out). */
function crossesInside(wall: WallSegment, room: { x: number; y: number; w: number; h: number }): boolean {
  const a = cell(wall.p1);
  const b = cell(wall.p2);
  // A room's walls stand on its floor's edge: half an outer wall in from the cell edge, and the wall's ink.
  const inset = OUTER_WALL / 2 + 0.04;
  for (let t = 0; t <= 1; t += 0.05) {
    const p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    if (p.x > room.x + inset && p.x < room.x + room.w - inset && p.y > room.y + inset && p.y < room.y + room.h - inset) return true;
  }
  return false;
}

describe('the walls of a house in the scene', () => {
  for (const look of ['parchment', 'print', 'night']) {
    it(`stand on the edges, two lines to an inner wall, never through a room (${look})`, () => {
      const walls = wallsOf(look);
      const model = edgeHouse();
      for (const room of model.floors[0]!.rooms) expect(walls.filter((wall) => crossesInside(wall, room))).toEqual([]);
      // The wall between room 3 and the closet (x = 8, y 3..5) is two parallel walls a hair either side of the edge.
      const between = walls.filter((wall) => wall.type === 'solid' && Math.abs(middle(wall).x - 8) < 0.06 && middle(wall).y > 3.2 && middle(wall).y < 4.8 && wall.p1.x === wall.p2.x);
      const sides = new Set(between.map((wall) => Math.sign(cell(wall.p1).x - 8)));
      expect(sides).toEqual(new Set([-1, 1]));
    });
  }

  it('closes every door on its edge and leaves the front door open to the outside', () => {
    const walls = wallsOf();
    const doors = walls.filter((wall) => wall.type === 'door');
    expect(doors).toHaveLength(3);
    for (const door of doors) {
      const m = middle(door);
      // Every door stands on an edge: one of its coordinates whole.
      expect(Math.min(Math.abs(m.x - Math.round(m.x)), Math.abs(m.y - Math.round(m.y)))).toBeLessThan(1e-6);
    }
    expect(walls.filter((wall) => wall.type === 'secret-door')).toHaveLength(1);
    // Nothing closes the front doorway's outer face below the hall (y = 4 + the outer wall).
    const face = walls.filter((wall) => wall.type === 'solid' && wall.p1.y === wall.p2.y && Math.abs(cell(wall.p1).y - (5 + OUTER_WALL / 2)) < 0.05 && middle(wall).x > 1 && middle(wall).x < 2);
    expect(face).toEqual([]);
  });

  it('cuts the outer wall at every window and stands a wall there that stops tokens alone', () => {
    const walls = wallsOf();
    const panes = walls.filter((wall) => wall.blocks === 'movement');
    const model = edgeHouse();
    expect(panes).toHaveLength(model.floors[0]!.windows!.length);
    for (const window of model.floors[0]!.windows!) {
      const [a, b] = windowSpan(window);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const near = (wall: WallSegment): boolean => Math.hypot(middle(wall).x - mid.x, middle(wall).y - mid.y) < OUTER_WALL / 2 + 0.07;
      expect(panes.filter(near)).toHaveLength(1);
      expect(walls.filter((wall) => wall.blocks !== 'movement' && near(wall))).toEqual([]);
    }
    for (const pane of panes) {
      expect(blocksNothing(pane)).toBe(true);
      expect(stopsNothing(pane)).toBe(false);
      expect(concerns(pane, 'sight') || concerns(pane, 'light')).toBe(false);
      expect(readWall(pane)?.blocks).toBe('movement');
    }
  });

  it('seals no window shut', () => {
    const walls = wallsOf();
    const bridges = sealedWalls(walls, 2).filter((wall) => !walls.includes(wall));
    const model = edgeHouse();
    for (const window of model.floors[0]!.windows!) {
      const [a, b] = windowSpan(window);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      expect(bridges.filter((wall) => !blocksNothing(wall) && Math.hypot(middle(wall).x - mid.x, middle(wall).y - mid.y) < 0.25)).toEqual([]);
    }
  });
});
