import { describe, expect, it } from 'vitest';
import { stackOf, stairEnd } from '../../../../src/app/dungeons/floors/floorStack';
import { approachCells, spotRect } from '../../../../src/app/dungeons/floors/stairSpots';
import { generateDungeon } from '../../../../src/app/dungeons/generate';
import { floorCellsOf } from '../../../../src/app/dungeons/geometry';
import type { DungeonModel } from '../../../../src/app/dungeons/model';
import { viewBounds } from '../../../../src/app/dungeons/render/art/artScene';
import { grownRings, unionRings } from '../../../../src/app/dungeons/render/clipShapes';
import { forestMass, woodsOutside } from '../../../../src/app/dungeons/render/forest/forestMass';
import { pointInPolygon, pointSegmentDistance, signedArea2, type Bounds, type Vec } from '../../../../src/app/dungeons/render/geometry';
import { mapLayout } from '../../../../src/app/dungeons/render/layoutSize';
import { visibleDungeon } from '../../../../src/app/dungeons/render/visibleDungeon';
import { treeLine } from '../../../../src/app/dungeons/scene/forestWalls';
import { DEFAULT_VIEW } from '../../../../src/app/dungeons/style';
import { dungeonStyle, type DungeonStyleId } from '../../../../src/app/dungeons/styleCatalog';
import type { DungeonTag } from '../../../../src/app/dungeons/tags';
import { movementWalls } from '../../../../src/app/online/movement/index.ts';
import { wallList } from '../../../../src/app/vision/wallList';
import { sceneOf, Walkable } from '../levelLinkAccess';

const CASES: { seed: number; tags: DungeonTag[]; floors: number; look: DungeonStyleId }[] = [
  { seed: 606, tags: ['medium', 'dry'], floors: 1, look: 'crayon' },
  { seed: 21, tags: ['medium'], floors: 1, look: 'parchment' },
  { seed: 33, tags: ['wet'], floors: 1, look: 'ice' },
  { seed: 47, tags: ['medium', 'wet'], floors: 2, look: 'volcanic' },
  { seed: 71, tags: ['large'], floors: 3, look: 'night' },
  { seed: 58, tags: [], floors: 1, look: 'print' },
  { seed: 5482, tags: ['medium'], floors: 1, look: 'crayon' },
  { seed: 5602, tags: ['winding'], floors: 2, look: 'crayon' },
  // A clearing whose neck the crowns closed: found by a sweep.
  { seed: 30066, tags: ['medium'], floors: 1, look: 'crayon' },
];

const forest = ({ seed, tags, floors }: typeof CASES[number]): DungeonModel => generateDungeon({ seed, theme: 'forest', tags, floors });

/** The map's rectangle, and that rectangle a cell larger each way, as a map's frame is drawn. */
function pictureOf(model: DungeonModel): { map: Bounds; drawn: Bounds } {
  const layout = mapLayout(model, 150, DEFAULT_VIEW);
  return { map: viewBounds(layout, 0), drawn: viewBounds(layout, 1) };
}

const inRings = (rings: readonly Vec[][], p: Vec): boolean => rings.some((ring) => pointInPolygon(ring, p.x, p.y));

describe('a Forest\'s walls', () => {
  for (const test of CASES) {
    const name = `seed ${test.seed}, ${test.look}`;

    it(`stand on the trees the map draws and along all of their edge: ${name}`, () => {
      const model = forest(test);
      const dungeon = visibleDungeon(model, DEFAULT_VIEW, 0);
      const style = dungeonStyle(test.look);
      const { map, drawn } = pictureOf(model);
      const line = treeLine(dungeon, style, map);
      const segments = line.flatMap((run) => run.slice(1).map((b, k) => [run[k]!, b] as const));
      expect(segments.length).toBeGreaterThan(100);
      const crowns = unionRings(forestMass(dungeon, style, drawn).map(({ clump }) => clump.ring));
      const stack = stackOf(model);
      const ways = dungeon.floor.stairs.flatMap((stair) => [spotRect(stair), ...approachCells(stair, stairEnd(stack, 0, stair.to)).map((c) => ({ x0: c.x, y0: c.y, x1: c.x, y1: c.y }))]);
      const atWay = (p: Vec, by: number): boolean => ways.some((r) => p.x >= r.x0 - by && p.x <= r.x1 + 1 + by && p.y >= r.y0 - by && p.y <= r.y1 + 1 + by);

      // Every wall lies within the crowns (a hair off where it was thinned), or where they overhang what stays walkable: a way down, a floor's middle or neck.
      const widened = grownRings(crowns, 0.06);
      const lost = segments.flatMap(([a, b]) => [a, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }]).filter((p) => !inRings(widened, p) && !atWay(p, 0.01) && dungeon.field.distance(p.x, p.y) > 0.02);
      expect(lost).toEqual([]);

      // And every corner of the crowns' edge a token can come to has a wall right by it. An inlet too narrow to walk in, or a stand of trees too small, is passed over.
      const outside = woodsOutside(dungeon);
      const stands = crowns.filter((ring) => Math.abs(signedArea2(ring)) / 2 > 0.3);
      const bare = stands.flat().filter((p) => outside(p.x, p.y) < 0.2 && p.x > map.minX + 0.3 && p.x < map.maxX - 0.3 && p.y > map.minY + 0.3 && p.y < map.maxY - 0.3 && !atWay(p, 0.4));
      expect(bare.length).toBeGreaterThan(100);
      const unwalled = bare.filter((p) => !segments.some(([a, b]) => Math.abs(a.x - p.x) + Math.abs(a.y - p.y) < 8 && pointSegmentDistance(p, a, b) < 0.3));
      expect(unwalled.length / bare.length).toBeLessThan(0.002);
    });

    it(`leave every clearing and way down to be walked to, sealing included: ${name}`, () => {
      const model = forest(test);
      const scene = sceneOf(model);
      const own = scene.levelIds[0] ? Object.fromEntries(Object.entries(scene.walls).filter(([, wall]) => wall.levels?.includes(scene.levelIds[0]!))) : scene.walls;
      const walk = new Walkable(scene, movementWalls(wallList(own), scene.image), 0);
      const floor = model.floors[0]!;
      // A cell's middle may lie under a crown: some cell of every clearing must be walked to (a one-cell junction is no clearing).
      for (const room of floor.rooms.filter((r) => r.kind === 'room')) expect(floorCellsOf(room).some((c) => walk.inMain(c)), `room ${room.id}`).toBe(true);
      const stack = stackOf(model);
      for (const stair of floor.stairs) for (const c of approachCells(stair, stairEnd(stack, 0, stair.to))) expect(walk.inMain(c), `before stairs ${c.x},${c.y}`).toBe(true);
    });
  }
});
