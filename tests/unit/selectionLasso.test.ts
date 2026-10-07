import { describe, expect, it } from 'vitest';
import { pointInPolygon } from '../../src/app/vision/visibility';
import { isPointInPolygon } from '../oracles/helperBaseline/selectionLasso';
import { between, random } from '../helpers/hashCorpus';

interface Pt { x: number; y: number }
type InsideTest = (x: number, y: number, polygon: Pt[]) => boolean;
type Shape = 'convex' | 'concave' | 'star' | 'scribble' | 'twice-round' | 'rectilinear' | 'repeated' | 'degenerate';
interface Query { at: 'centre' | 'vertex' | 'midpoint' | 'horizontal' | 'random'; x: number; y: number }
interface Lasso { shape: Shape; polygon: Pt[]; queries: Query[] }

/** Shapes whose drawn path winds twice around some of the ground it encloses. */
const SELF_CROSSING: readonly Shape[] = ['star', 'scribble', 'twice-round'];

/** `count` corners around (cx, cy) at radius `radius(i)`, at seeded angles in order, on whole pixels. */
function ring(rng: () => number, count: number, radius: (i: number) => number): Pt[] {
  const cx = between(rng, 200, 800), cy = between(rng, 200, 800);
  const angles = Array.from({ length: count }, () => rng() * Math.PI * 2).sort((a, b) => a - b);
  return angles.map((angle, i) => ({ x: Math.round(cx + Math.cos(angle) * radius(i)), y: Math.round(cy + Math.sin(angle) * radius(i)) }));
}

function polygonOf(rng: () => number, shape: Shape): Pt[] {
  const r = between(rng, 20, 200);
  switch (shape) {
    case 'convex': return ring(rng, between(rng, 3, 12), () => r);
    case 'concave': return ring(rng, 2 * between(rng, 3, 7), (i) => (i % 2 === 0 ? r : r * 0.5));
    case 'star': {
      const count = [5, 7, 9][between(rng, 0, 2)]!;
      const cx = between(rng, 200, 800), cy = between(rng, 200, 800);
      return Array.from({ length: count }, (_, i) => {
        const angle = (2 * i * 2 * Math.PI) / count;
        return { x: Math.round(cx + Math.cos(angle) * r), y: Math.round(cy + Math.sin(angle) * r) };
      });
    }
    case 'scribble': return Array.from({ length: between(rng, 4, 12) }, () => ({ x: between(rng, 0, 400), y: between(rng, 0, 400) }));
    case 'twice-round': {
      const once = ring(rng, between(rng, 3, 8), () => r);
      return [...once, ...once];
    }
    case 'rectilinear': {
      const x = between(rng, 0, 500), y = between(rng, 0, 500), w = between(rng, 30, 300), h = between(rng, 30, 300);
      const t = between(rng, 5, Math.floor(w / 3));
      return [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x: x + w - t, y: y + h }, { x: x + w - t, y: y + t }, { x: x + t, y: y + t }, { x: x + t, y: y + h }, { x, y: y + h }];
    }
    case 'repeated': return ring(rng, 2 * between(rng, 3, 6), (i) => (i % 2 === 0 ? r : r * 0.6)).flatMap((p) => (rng() < 0.4 ? [p, { ...p }] : [p]));
    case 'degenerate': return [];
  }
}

/** Corners, edge midpoints, points along level edges and the middle, then seeded points around the shape, 50 in all. */
function queriesOf(rng: () => number, polygon: Pt[]): Query[] {
  const corners = polygon.length > 0 ? polygon : [{ x: 0, y: 0 }, { x: 10, y: 10 }];
  const xs = corners.map((p) => p.x), ys = corners.map((p) => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const chosen: Query[] = [{ at: 'centre', x: (minX + maxX) / 2, y: (minY + maxY) / 2 }];
  polygon.forEach((a, i) => {
    const b = polygon[(i + 1) % polygon.length]!;
    chosen.push({ at: 'vertex', ...a }, { at: 'midpoint', x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    if (a.y === b.y && a.x !== b.x) for (const k of [1, 3]) chosen.push({ at: 'horizontal', x: a.x + ((b.x - a.x) * k) / 4, y: a.y });
  });
  const queries = chosen.slice(0, 40);
  while (queries.length < 50) {
    queries.push({ at: 'random', x: minX - 20 + rng() * (maxX - minX + 40), y: minY - 20 + rng() * (maxY - minY + 40) });
  }
  return queries;
}

const SHAPES: readonly Shape[] = ['convex', 'concave', 'star', 'scribble', 'twice-round', 'rectilinear', 'repeated'];

/** 297 seeded lassos, half with the closing corner the lasso tool appends, and lassos of 0, 1 and 2 corners. */
function lassos(): Lasso[] {
  const rng = random(0x1a550);
  const result: Lasso[] = [];
  for (let n = 0; n < 297; n++) {
    const shape = SHAPES[n % SHAPES.length]!;
    const polygon = polygonOf(rng, shape);
    if (rng() < 0.5) polygon.push({ ...polygon[0]! });
    result.push({ shape, polygon, queries: queriesOf(rng, polygon) });
  }
  for (const polygon of [[], [{ x: 10, y: 10 }], [{ x: 10, y: 10 }, { x: 60, y: 90 }]]) {
    result.push({ shape: 'degenerate', polygon, queries: queriesOf(rng, polygon) });
  }
  return result;
}

const LASSOS = lassos();

function firstMismatch(candidate: InsideTest, reference: InsideTest): { shape: Shape; at: Query['at'] } | null {
  for (const { shape, polygon, queries } of LASSOS) {
    for (const { at, x, y } of queries) if (candidate(x, y, polygon) !== reference(x, y, polygon)) return { shape, at };
  }
  return null;
}

const shared: InsideTest = (x, y, polygon) => pointInPolygon({ x, y }, polygon);

/** Nonzero winding with the even-odd test's own crossing rule. */
const nonzero: InsideTest = (x, y, polygon) => {
  let winding = 0;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]!, b = polygon[j]!;
    if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) winding += a.y > b.y ? 1 : -1;
  }
  return winding !== 0;
};

/** The lasso's old test, counting a crossing exactly at the point. */
const closedOnTheRight: InsideTest = (x, y, polygon) => {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]!, b = polygon[j]!;
    if ((a.y > y) !== (b.y > y) && x <= ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
};

describe('the lasso test compared with pointInPolygon', () => {
  it('decides every point of every lasso as the lasso did', () => {
    expect(LASSOS).toHaveLength(300);
    expect(firstMismatch(shared, isPointInPolygon)).toBeNull();
  });

  it('can tell nonzero winding apart, on lassos that cross themselves', () => {
    const found = firstMismatch(nonzero, isPointInPolygon);
    expect(found !== null && SELF_CROSSING.includes(found.shape)).toBe(true);
  });

  it('can tell a crossing counted at the point itself apart, on points of the outline', () => {
    const found = firstMismatch(closedOnTheRight, isPointInPolygon);
    expect(found !== null && found.at !== 'random' && found.at !== 'centre').toBe(true);
  });
});
