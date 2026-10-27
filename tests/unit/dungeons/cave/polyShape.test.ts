import { describe, expect, it } from 'vitest';
import { cellsOf } from '../../../../src/app/dungeons/geometry';
import type { DungeonModel, DungeonRoom } from '../../../../src/app/dungeons/model';
import { rngFrom } from '../../../../src/app/dungeons/rng';
import { PolyField } from '../../../../src/app/dungeons/render/cave/polyField';
import { grownRings } from '../../../../src/app/dungeons/render/clipShapes';
import { type FloorShape, type Vec, pointInPolygon, pointSegmentDistance, roomShape, shapeBounds, shapeDistance, signedArea2 } from '../../../../src/app/dungeons/render/geometry';
import { renderMapSvg } from '../../../../src/app/dungeons/render/renderMap';
import { wallRings } from '../../../../src/app/dungeons/scene/wallOutline';
import { DEFAULT_VIEW } from '../../../../src/app/dungeons/style';
import { dungeonStyle } from '../../../../src/app/dungeons/styleCatalog';
import { chaikin } from '../../../../src/app/dungeons/water/smooth';
import { addDoor, addRoom, emptyModel, entryFloor } from '../../../fixtures/dungeonModelBuilder';

const square = (x0: number, y0: number, x1: number, y1: number): Vec[] => [
  { x: x0, y: y0 },
  { x: x1, y: y0 },
  { x: x1, y: y1 },
  { x: x0, y: y1 },
];

function bruteDistance(rings: readonly Vec[][], x: number, y: number): number {
  let best = Infinity;
  let inside = false;
  for (const ring of rings) {
    if (pointInPolygon(ring, x, y)) inside = !inside;
    for (let i = 0; i < ring.length; i++) best = Math.min(best, pointSegmentDistance({ x, y }, ring[i]!, ring[(i + 1) % ring.length]!));
  }
  return inside ? -best : best;
}

const area = (rings: readonly Vec[][]): number => rings.reduce((sum, ring) => sum + signedArea2(ring) / 2, 0);

/** A 7 × 7 chamber round a 3 × 3 island of rock, entered from the top. */
function ringModel(): DungeonModel {
  const model = { ...emptyModel(5), theme: 'cavern' as const };
  const floor = entryFloor(model);
  const cells = cellsOf({ x0: 0, y0: 0, x1: 6, y1: 6 }).filter((c) => !(c.x >= 2 && c.x <= 4 && c.y >= 2 && c.y <= 4));
  addRoom(floor, { x: 0, y: 0, w: 7, h: 7, axis: { x: 0, y: 1 }, cells } as DungeonRoom);
  addDoor(floor, 3, -1, { x: 0, y: 1 }, 'opening', null, 0);
  return model;
}

describe('a poly floor shape', () => {
  it('equal to a rectangle draws, bounds and measures like the rectangle', () => {
    const rect: FloorShape = { kind: 'rect', x: 2, y: 3, w: 4, h: 5 };
    const poly: FloorShape = { kind: 'poly', rings: [square(2, 3, 6, 8)] };
    expect(shapeBounds(poly)).toEqual(shapeBounds(rect));
    expect(shapeBounds(poly, 0.5)).toEqual(shapeBounds(rect, 0.5));
    const rng = rngFrom(3);
    for (let k = 0; k < 400; k++) {
      const x = rng() * 10 - 1;
      const y = rng() * 12 - 1;
      expect(shapeDistance(poly, x, y)).toBeCloseTo(shapeDistance(rect, x, y), 9);
    }
    expect(wallRings([poly], [], 0.03)).toEqual(wallRings([rect], [], 0.03));
  });

  it('with a hole is floor around the hole only', () => {
    const poly: FloorShape = { kind: 'poly', rings: [square(0, 0, 10, 10), square(4, 4, 6, 6).reverse()] };
    expect(shapeDistance(poly, 2, 2)).toBeLessThan(0);
    expect(shapeDistance(poly, 5, 5)).toBeGreaterThan(0);
    const walls = wallRings([poly], [], 0.05);
    expect(walls).toHaveLength(2);
    expect(walls.filter((ring) => signedArea2(ring) < 0)).toHaveLength(1);
  });

  it('PolyField agrees with brute force', () => {
    const rng = rngFrom(11);
    const blob = chaikin(
      Array.from({ length: 50 }, (_, k) => {
        const a = (k / 50) * Math.PI * 2;
        const r = 8 + rng() * 4;
        return { x: 15 + Math.cos(a) * r, y: 15 + Math.sin(a) * r };
      }),
      3,
    );
    expect(blob).toHaveLength(400);
    const field = new PolyField([blob]);
    const points = Array.from({ length: 2000 }, () => ({ x: rng() * 34 - 2, y: rng() * 34 - 2 }));
    for (const p of points) expect(field.distance(p.x, p.y)).toBeCloseTo(bruteDistance([blob], p.x, p.y), 9);
    const start = performance.now();
    for (let round = 0; round < 5; round++) for (const p of points) field.distance(p.x, p.y);
    expect((performance.now() - start) / (points.length * 5)).toBeLessThan(0.02);
  });

  it('grownRings keeps holes', () => {
    const grown = grownRings([square(0, 0, 10, 10), square(4, 4, 6, 6).reverse()], 0.1);
    const hole = grown.find((ring) => signedArea2(ring) < 0);
    expect(hole).toBeDefined();
    expect(Math.abs(area([hole!]))).toBeCloseTo(1.8 * 1.8, 1);
    expect(Math.abs(Math.abs(area([hole!])) - 3.24) / 3.24).toBeLessThan(0.01);
    expect(area(grown.filter((ring) => signedArea2(ring) > 0))).toBeGreaterThan(104);
  });

  it('is a cave room’s shape, traced from its cells', () => {
    const shape = roomShape(ringModel().floors[0]!.rooms[0]!);
    expect(shape.kind).toBe('poly');
    expect(shape.kind === 'poly' && shape.rings).toHaveLength(2);
  });

  it('the SVG export of a poly floor records one closed path per ring', () => {
    const model = ringModel();
    const { svg, layout } = renderMapSvg(model, dungeonStyle('parchment'), DEFAULT_VIEW, { pxPerCell: 30 });
    const shape = roomShape(model.floors[0]!.rooms[0]!);
    const px = (p: Vec): string => `${(p.x - layout.originCell.x) * 30} ${(p.y - layout.originCell.y) * 30}`;
    const subpath = (ring: readonly Vec[]): string => `M${ring.map(px).join('L')}Z`;
    const rings = shape.kind === 'poly' ? shape.rings : [];
    const paths = [...svg.matchAll(/ d="([^"]*)"/g)].map((m) => m[1]!);
    expect(paths.some((d) => rings.every((ring) => d.includes(subpath(ring))))).toBe(true);
  });
});
