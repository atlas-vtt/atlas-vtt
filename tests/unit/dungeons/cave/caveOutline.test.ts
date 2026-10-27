import { describe, expect, it } from 'vitest';
import { cellKey } from '../../../../src/app/dungeons/geometry';
import type { CellPoint } from '../../../../src/app/dungeons/model';
import { type Rng, rngFrom } from '../../../../src/app/dungeons/rng';
import { caveOutline, type PinnedEdge } from '../../../../src/app/dungeons/render/cave/caveOutline';
import { type FloorShape, type Vec, pointInPolygon } from '../../../../src/app/dungeons/render/geometry';
import type { CellGrid } from '../../../../src/app/dungeons/water/wetGrid';
import { timeBound } from '../../../helpers/timeBound';

type Mask = Set<string>;

const has = (mask: Mask, x: number, y: number): boolean => mask.has(cellKey(x, y));

/** Two cells of one kind meeting only at a corner, with two of the other kind across the other diagonal. */
function touchesDiagonally(mask: Mask, box: CellGrid): boolean {
  for (let y = box.y0 - 1; y < box.y0 + box.h; y++) {
    for (let x = box.x0 - 1; x < box.x0 + box.w; x++) {
      const a = has(mask, x, y);
      const b = has(mask, x + 1, y);
      const c = has(mask, x, y + 1);
      const d = has(mask, x + 1, y + 1);
      if (a === d && b === c && a !== b) return true;
    }
  }
  return false;
}

function blob(rng: Rng, size: number): Mask {
  const mask: Mask = new Set([cellKey(size >> 1, size >> 1)]);
  const target = Math.floor(size * size * (0.2 + rng() * 0.3));
  while (mask.size < target) {
    const cells = [...mask];
    const [x, y] = cells[Math.floor(rng() * cells.length)]!.split(',').map(Number) as [number, number];
    const [dx, dy] = [[1, 0], [-1, 0], [0, 1], [0, -1]][Math.floor(rng() * 4)]!;
    const nx = x + dx!;
    const ny = y + dy!;
    if (nx > 0 && ny > 0 && nx < size - 1 && ny < size - 1) mask.add(cellKey(nx, ny));
  }
  return mask;
}

function tunnel(rng: Rng, size: number, width: 1 | 2): Mask {
  const mask: Mask = new Set();
  let x = 2;
  let y = 2 + Math.floor(rng() * (size - 6));
  while (x < size - 3) {
    for (let a = 0; a < width; a++) for (let b = 0; b < width; b++) mask.add(cellKey(x + a, y + b));
    if (rng() < 0.6) x++;
    else y = Math.max(2, Math.min(size - 4, y + (rng() < 0.5 ? -1 : 1)));
  }
  return mask;
}

function island(size: number): Mask {
  const mask: Mask = new Set();
  for (let y = 1; y < size - 1; y++) for (let x = 1; x < size - 1; x++) if (!(x > 3 && x < size - 4 && y > 3 && y < size - 4)) mask.add(cellKey(x, y));
  return mask;
}

const BOX: CellGrid = { x0: -1, y0: -1, w: 16, h: 16 };

function masks(): Mask[] {
  const rng = rngFrom(97);
  const out: Mask[] = [];
  while (out.length < 300) {
    const kind = out.length % 4;
    const mask = kind === 0 || kind === 3 ? blob(rng, 14) : kind === 1 ? tunnel(rng, 14, 1) : out.length % 8 === 2 ? island(14) : tunnel(rng, 14, 2);
    if (!touchesDiagonally(mask, BOX)) out.push(mask);
  }
  return out;
}

const ringsOf = (shapes: readonly FloorShape[]): Vec[][] => shapes.flatMap((s) => (s.kind === 'poly' ? s.rings : []));

function insideAll(rings: readonly Vec[][], x: number, y: number): boolean {
  let inside = false;
  for (const ring of rings) if (pointInPolygon(ring, x, y)) inside = !inside;
  return inside;
}

/** Whether two segments cross at a point inside both. */
function segmentsCross(a: Vec, b: Vec, c: Vec, d: Vec): boolean {
  const side = (o: Vec, p: Vec, q: Vec): number => (p.x - o.x) * (q.y - o.y) - (p.y - o.y) * (q.x - o.x);
  const [d1, d2, d3, d4] = [side(c, d, a), side(c, d, b), side(a, b, c), side(a, b, d)];
  return d1 * d2 < -1e-18 && d3 * d4 < -1e-18;
}

const outline = (mask: Mask, pinned: readonly PinnedEdge[] = [], seed = 5): FloorShape[] => caveOutline(seed, 0, (x, y) => has(mask, x, y), BOX, pinned);

describe('a cave outline', () => {
  const all = masks();

  it('crosses neither itself nor another ring', () => {
    let crossings = 0;
    for (const mask of all.slice(0, 100)) {
      const rings = ringsOf(outline(mask));
      const segments = rings.flatMap((ring, r) => ring.map((a, i) => ({ r, i, n: ring.length, a, b: ring[(i + 1) % ring.length]! })));
      for (const p of segments) {
        for (const q of segments) {
          if (q.r < p.r || (q.r === p.r && (q.i <= p.i + 1 || p.i + p.n - q.i <= 1))) continue;
          if (segmentsCross(p.a, p.b, q.a, q.b)) crossings++;
        }
      }
    }
    expect(crossings).toBe(0);
  });

  it('wanders off the cell grid: little of it runs along a cell edge', () => {
    let along = 0;
    let total = 0;
    for (const mask of all.slice(0, 60)) {
      for (const ring of ringsOf(outline(mask))) {
        ring.forEach((a, i) => {
          const b = ring[(i + 1) % ring.length]!;
          const length = Math.hypot(b.x - a.x, b.y - a.y);
          total += length;
          if ((a.x === b.x && Number.isInteger(a.x)) || (a.y === b.y && Number.isInteger(a.y))) along += length;
        });
      }
    }
    expect(along / total).toBeLessThan(0.05);
  });

  it('agrees with its cells: a floor cell has its middle and 60 % or more drawn floor, a rock cell its middle and 60 % or more rock', () => {
    const wrong: string[] = [];
    for (const mask of all) {
      const rings = ringsOf(outline(mask));
      for (let y = BOX.y0; y < BOX.y0 + BOX.h; y++) {
        for (let x = BOX.x0; x < BOX.x0 + BOX.w; x++) {
          let inside = 0;
          for (let i = 0; i < 10; i++) for (let j = 0; j < 10; j++) if (insideAll(rings, x + (i + 0.5) / 10, y + (j + 0.5) / 10)) inside++;
          const middle = insideAll(rings, x + 0.5, y + 0.5);
          if (has(mask, x, y) ? inside < 60 || !middle : inside > 40 || middle) wrong.push(`${has(mask, x, y) ? 'floor' : 'rock'} ${x},${y}: ${inside}`);
        }
      }
    }
    expect(wrong.slice(0, 10)).toEqual([]);
  }, 60_000);

  it('keeps the middle of every kept cell (a narrows, the main path, where something stands) drawn floor', () => {
    const wrong: string[] = [];
    for (const mask of all.slice(0, 120)) {
      const kept = (x: number, y: number): boolean => has(mask, x, y) && (x + 2 * y) % 3 === 0;
      const rings = ringsOf(caveOutline(5, 0, (x, y) => has(mask, x, y), BOX, [], kept));
      for (let y = BOX.y0; y < BOX.y0 + BOX.h; y++) {
        for (let x = BOX.x0; x < BOX.x0 + BOX.w; x++) {
          if (!kept(x, y)) continue;
          for (let i = 0; i <= 8; i++) for (let j = 0; j <= 8; j++) if (!insideAll(rings, x + 0.21 + (0.58 * i) / 8, y + 0.21 + (0.58 * j) / 8)) wrong.push(`${x},${y}`);
        }
      }
    }
    expect([...new Set(wrong)].slice(0, 10)).toEqual([]);
  });

  it('keeps a pinned edge a straight segment on its cell edge', () => {
    const mask = all[1]!;
    const top = [...mask].map((k) => k.split(',').map(Number) as [number, number]).filter(([x, y]) => !has(mask, x, y - 1))[0]!;
    const pin: PinnedEdge = { a: { x: top[0], y: top[1] }, b: { x: top[0] + 1, y: top[1] } };
    const ring = ringsOf(outline(mask, [pin])).find((r) => r.some((p) => p.x === pin.a.x && p.y === pin.a.y));
    expect(ring).toBeDefined();
    const i = ring!.findIndex((p) => p.x === pin.a.x && p.y === pin.a.y);
    expect(ring!.some((p) => p.x === pin.b.x && p.y === pin.b.y)).toBe(true);
    const between = ring!.filter((p) => p.y === pin.a.y && p.x > pin.a.x && p.x < pin.b.x);
    for (let k = 1; k <= between.length; k++) expect(ring![(i + k) % ring!.length]!.y).toBe(pin.a.y);
  });

  it('is the same for the same mask, and a cell added moves vertices only within 2 cells of it', () => {
    const mask = all[0]!;
    expect(outline(mask)).toEqual(outline(mask));
    const grown = new Set(mask);
    const edge = [...mask].map((k) => k.split(',').map(Number) as [number, number]).find(([x, y]) => !has(mask, x + 1, y) && !has(mask, x + 1, y - 1) && !has(mask, x + 1, y + 1) && !has(mask, x + 2, y) && x < 11)!;
    const added: CellPoint = { x: edge[0] + 1, y: edge[1] };
    grown.add(cellKey(added.x, added.y));
    const far = (p: Vec): boolean => Math.max(Math.abs(p.x - (added.x + 0.5)), Math.abs(p.y - (added.y + 0.5))) > 2.5;
    const before = new Set(ringsOf(outline(mask)).flat().filter(far).map((p) => `${p.x},${p.y}`));
    const after = new Set(ringsOf(outline(grown)).flat().filter(far).map((p) => `${p.x},${p.y}`));
    expect(after).toEqual(before);
  });

  it('gives a mask with an island one poly with a hole', () => {
    const shapes = outline(island(14));
    expect(shapes).toHaveLength(1);
    expect(shapes[0]!.kind === 'poly' && shapes[0]!.rings).toHaveLength(2);
  });

  it('traces a 120 × 120 cave in under 40 ms', () => {
    const rng = rngFrom(5);
    const mask: Mask = new Set();
    for (let k = 0; k < 30; k++) {
      const ox = Math.floor(rng() * 104);
      const oy = Math.floor(rng() * 104);
      for (const key of blob(rng, 16)) {
        const [x, y] = key.split(',').map(Number) as [number, number];
        mask.add(cellKey(x + ox, y + oy));
      }
    }
    const box: CellGrid = { x0: -1, y0: -1, w: 122, h: 122 };
    const times: number[] = [];
    for (let run = 0; run < 5; run++) {
      const start = performance.now();
      caveOutline(run, 0, (x, y) => has(mask, x, y), box, []);
      times.push(performance.now() - start);
    }
    times.sort((a, b) => a - b);
    expect(times[2]).toBeLessThan(timeBound(40));
  });
});
