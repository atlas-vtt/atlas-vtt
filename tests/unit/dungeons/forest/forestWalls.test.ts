import { describe, expect, it } from 'vitest';
import { stackOf, stairEnd } from '../../../../src/app/dungeons/floors/floorStack';
import { approachCells, spotRect } from '../../../../src/app/dungeons/floors/stairSpots';
import { generateDungeon } from '../../../../src/app/dungeons/generate';
import { floorCellsOf } from '../../../../src/app/dungeons/geometry';
import type { DungeonModel } from '../../../../src/app/dungeons/model';
import { viewBounds } from '../../../../src/app/dungeons/render/art/artScene';
import { unionRings } from '../../../../src/app/dungeons/render/clipShapes';
import { forestMass, woodsOutside } from '../../../../src/app/dungeons/render/forest/forestMass';
import { leafyMass, massEdge, needledRing, traceShape } from '../../../../src/app/dungeons/render/grounds/crowns';
import { pointInPolygon, pointSegmentDistance, signedArea2, type Bounds, type Vec } from '../../../../src/app/dungeons/render/geometry';
import { DEFAULT_PX_PER_CELL, mapLayout, SCENE_MAP_PIXELS, suggestedPxPerCell } from '../../../../src/app/dungeons/render/layoutSize';
import { visibleDungeon } from '../../../../src/app/dungeons/render/visibleDungeon';
import { necksOf, treeLine } from '../../../../src/app/dungeons/scene/forestWalls';
import { worldTexel } from '../../../../src/app/lighting/lightingConstants';
import { sealedWalls } from '../../../../src/app/lighting/sealWalls';
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

/** How far from each other a wall and what it follows may lie, in cells: what thinning may leave, and no more. */
const ON_THE_EDGE = 0.035;

/** How many walls sight may go by for each drawn, sealing's bridges included. */
const MOST_SEALED = 1.3;
/** The walls a test case may have: what the cave outline under the crowns had. */
const MOST_WALLS = 4500;

/** The distance from a point to the nearest of `lines`, up to a cell off. */
function distanceTo(lines: readonly (readonly [Vec, Vec])[]): (p: Vec) => number {
  const cells = new Map<string, (readonly [Vec, Vec])[]>();
  for (const line of lines) {
    const [a, b] = line;
    for (let x = Math.floor(Math.min(a.x, b.x)); x <= Math.floor(Math.max(a.x, b.x)); x++) for (let y = Math.floor(Math.min(a.y, b.y)); y <= Math.floor(Math.max(a.y, b.y)); y++) {
      const key = `${x},${y}`;
      cells.set(key, [...(cells.get(key) ?? []), line]);
    }
  }
  return (p) => {
    let nearest = 1;
    for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (const [a, b] of cells.get(`${Math.floor(p.x) + x},${Math.floor(p.y) + y}`) ?? []) nearest = Math.min(nearest, pointSegmentDistance(p, a, b));
    return nearest;
  };
}

const sidesOf = (ring: readonly Vec[]): (readonly [Vec, Vec])[] => ring.map((p, k) => [p, ring[(k + 1) % ring.length]!] as const);

/** Points along a wall at most a twentieth of a cell apart, each in the middle of what it stands for. */
function along([a, b]: readonly [Vec, Vec]): Vec[] {
  const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 0.05));
  return Array.from({ length: steps }, (_, k) => ({ x: a.x + ((b.x - a.x) * (k + 0.5)) / steps, y: a.y + ((b.y - a.y) * (k + 0.5)) / steps }));
}

describe('the edge a wall follows on a crown', () => {
  it('lies on the curves a broadleaf mass is drawn with', () => {
    const { shape } = leafyMass({ x: 3, y: 4 }, 0.5, 0, 77);
    const start = shape.points[0]!;
    const curves: { from: Vec; control: Vec; to: Vec }[] = [];
    let from = start;
    const recorder = {
      moveTo: (x: number, y: number): void => { from = { x, y }; },
      quadraticCurveTo: (cx: number, cy: number, x: number, y: number): void => {
        curves.push({ from, control: { x: cx, y: cy }, to: { x, y } });
        from = { x, y };
      },
      closePath: (): void => {},
    };
    traceShape(recorder as unknown as CanvasPath, shape);

    const edge = massEdge(shape);
    expect(edge).toHaveLength(curves.length * 4);
    curves.forEach(({ from: q, control: c, to: p }, k) => {
      expect(edge[k * 4]!.x).toBeCloseTo(q.x, 9);
      expect(edge[k * 4]!.y).toBeCloseTo(q.y, 9);
      expect(edge[k * 4 + 2]!.x).toBeCloseTo((q.x + p.x) / 4 + c.x / 2, 9);
      expect(edge[k * 4 + 2]!.y).toBeCloseTo((q.y + p.y) / 4 + c.y / 2, 9);
    });
  });

  it('runs along a conifer whorl\'s branch tips and over its notches', () => {
    const centre = { x: 3, y: 4 };
    const r = 0.5;
    const branches = 20;
    const reach = (p: Vec): number => Math.hypot(p.x - centre.x, p.y - centre.y);
    const ring = needledRing(centre, r, branches, 0.4, 77);
    const tips = massEdge({ points: ring });
    expect(tips).toHaveLength(branches);
    // Each is the farthest point of its branch, and of what it leaves out no point stands beyond it.
    tips.forEach((tip, k) => {
      for (const p of ring.slice(k * 4, k * 4 + 4)) expect(reach(p)).toBeLessThanOrEqual(reach(tip));
      expect(reach(tip)).toBeGreaterThanOrEqual(r * 0.84);
    });
  });
});

describe('the necks a crown may not close', () => {
  const box = (x: number, y: number, w: number, h: number): Vec[] => [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }];
  // Two clearings joined by a passage a cell wide, the left one with a bay as narrow that leads nowhere.
  const floors = unionRings([box(0, 0, 4, 4), box(8, 0, 4, 4), box(4, 1.5, 4, 1), box(1.5, 4, 1, 3)]);
  const necks = necksOf(floors);
  const inNeck = (x: number, y: number): boolean => necks.some((ring) => pointInPolygon(ring, x, y));

  it('hold the passage between two clearings', () => {
    expect(inNeck(6, 2)).toBe(true);
  });

  it('leave a bay and the clearings themselves to the crowns', () => {
    expect(inNeck(2, 6)).toBe(false);
    expect(inNeck(2, 2)).toBe(false);
    expect(inNeck(10, 2)).toBe(false);
  });
});

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
      expect(segments.length).toBeLessThan(MOST_WALLS);
      // Few corners lie closer than the sealing's tolerance, in the pixels a scene draws at: each such pair is a bridge sight has to go by too, so a finer line costs far more than its corners.
      const px = suggestedPxPerCell(model, DEFAULT_PX_PER_CELL, DEFAULT_VIEW, SCENE_MAP_PIXELS);
      const layout = mapLayout(model, px, DEFAULT_VIEW);
      const walls = segments.map(([a, b], k) => ({ id: `w${k}`, kind: 'wall' as const, type: 'solid' as const, p1: { x: a.x * px, y: a.y * px }, p2: { x: b.x * px, y: b.y * px } }));
      expect(sealedWalls(walls, worldTexel({ width: layout.widthPx, height: layout.heightPx })).length / walls.length).toBeLessThan(MOST_SEALED);
      const crowns = unionRings(forestMass(dungeon, style, drawn).map(({ clump }) => massEdge(clump.shape)));
      const stack = stackOf(model);
      const ways = dungeon.floor.stairs.flatMap((stair) => [spotRect(stair), ...approachCells(stair, stairEnd(stack, 0, stair.to)).map((c) => ({ x0: c.x, y0: c.y, x1: c.x, y1: c.y }))]);
      const atWay = (p: Vec, by: number): boolean => ways.some((r) => p.x >= r.x0 - by && p.x <= r.x1 + 1 + by && p.y >= r.y0 - by && p.y <= r.y1 + 1 + by);

      // The walls lie on the drawn edge. They leave it only where it overhangs what stays walkable, a way down or a neck, and those are few.
      const toCrowns = distanceTo(crowns.flatMap(sidesOf));
      const points = segments.flatMap(along);
      const off = points.filter((p) => toCrowns(p) > ON_THE_EDGE);
      expect(off.filter((p) => !atWay(p, 0.01) && dungeon.field.distance(p.x, p.y) > ON_THE_EDGE)).toEqual([]);
      expect(off.length / points.length).toBeLessThan(0.03);

      // And the drawn edge a token can come to has a wall on it. An inlet too narrow to walk in, or a stand of trees too small, is passed over.
      const outside = woodsOutside(dungeon);
      const stands = crowns.filter((ring) => Math.abs(signedArea2(ring)) / 2 > 0.3);
      const edge = stands.flat().filter((p) => outside(p.x, p.y) < 0.2 && p.x > map.minX + 0.3 && p.x < map.maxX - 0.3 && p.y > map.minY + 0.3 && p.y < map.maxY - 0.3 && !atWay(p, 0.4));
      expect(edge.length).toBeGreaterThan(100);
      const toWalls = distanceTo(segments);
      expect(edge.filter((p) => toWalls(p) > ON_THE_EDGE).length / edge.length).toBeLessThan(0.05);
    });

    it(`leave every clearing and way down to be walked to, sealing included: ${name}`, () => {
      const model = forest(test);
      const scene = sceneOf(model, test.look);
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
