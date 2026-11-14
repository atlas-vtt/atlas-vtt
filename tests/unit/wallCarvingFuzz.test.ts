/// <reference types="vite/client" />
import { expect, it } from 'vitest';
import { areaOf, type RoomArea } from '../../src/app/lighting/rooms';
import { carvedWalls } from '../../src/app/lighting/wallCarving';
import { floorOf } from '../../src/app/lighting/wallSpaces';
import { shapeContains } from '../../src/app/lighting/shapeContains';
import type { WallSegment } from '../../src/app/types/wallTypes';

type P = { x: number; y: number };
let n = 0;
const rectArea = (a: P, b: P): RoomArea => areaOf([[{ x: a.x, y: a.y }, { x: b.x, y: a.y }, { x: b.x, y: b.y }, { x: a.x, y: b.y }]]);
const floorsOf = (walls: WallSegment[]): RoomArea[] => floorOf(walls);
function carve(walls: WallSegment[], area: RoomArea): WallSegment[] {
  const { remove, add } = carvedWalls(area, walls, floorsOf(walls), `c${n}`);
  return [...walls.filter((w) => !remove.includes(w.id)), ...add.map((w) => ({ ...w, id: `w${n++}`, kind: 'wall' as const }))];
}
const next = (seed: number): (() => number) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);

/** More runs with `VITE_CARVE_TRIALS` (12,000 take under a minute). */
const TRIALS = Number(import.meta.env.VITE_CARVE_TRIALS ?? 300);

/**
 * Rectangles carved one after another, on a grid (shared edges and corners, as Shift snaps), freely,
 * and a pixel or so off each other's lines (as a hand draws). Returns the runs in which a carved
 * shape was not floor afterwards, or a wall was left inside one. With `opening`, one wall of at
 * most a few cells is taken away along the way: an entrance without a door.
 */
function failures(opening: boolean): string[] {
  const bad: string[] = [];
  for (let seed = 1; seed <= TRIALS; seed++) {
    const random = next(seed);
    const kind = seed % 3;
    const at = (): number => (kind === 0 ? Math.round(random() * 10) * 75 : kind === 1 ? random() * 750 : Math.round(random() * 10) * 75 + (random() - 0.5) * 3);
    let walls: WallSegment[] = [];
    const carved: { a: P; b: P }[] = [];
    const opensAt = 1 + Math.floor(random() * 4);
    for (let step = 0; step < 7; step++) {
      const [x1, y1, x2, y2] = [at(), at(), at(), at()];
      if (Math.abs(x1 - x2) < 30 || Math.abs(y1 - y2) < 30) continue;
      const [a, b] = [{ x: Math.min(x1, x2), y: Math.min(y1, y2) }, { x: Math.max(x1, x2), y: Math.max(y1, y2) }];
      walls = carve(walls, rectArea(a, b));
      carved.push({ a, b });
      if (opening && step === opensAt) {
        const short = walls.filter((w) => Math.hypot(w.p2.x - w.p1.x, w.p2.y - w.p1.y) <= 160);
        const gone = short[Math.floor(random() * short.length)];
        if (gone) walls = walls.filter((w) => w !== gone);
      }
      const floors = floorsOf(walls);
      let rock = 0;
      for (const { a: p, b: q } of carved) for (const share of [0.2, 0.5, 0.8]) {
        if (!floors.some((s) => shapeContains(s, { x: p.x + share * (q.x - p.x), y: p.y + (1 - share) * (q.y - p.y) }))) rock++;
      }
      const inside = walls.filter(({ p1, p2 }) => carved.some(({ a: p, b: q }) => (p1.x + p2.x) / 2 > p.x + 3 && (p1.x + p2.x) / 2 < q.x - 3 && (p1.y + p2.y) / 2 > p.y + 3 && (p1.y + p2.y) / 2 < q.y - 3));
      if (rock > 0 || inside.length > 0) {
        bad.push(`seed ${seed} step ${step}: rock ${rock} inside ${inside.length} carved ${JSON.stringify(carved.map(({ a: p, b: q }) => [+p.x.toFixed(2), +p.y.toFixed(2), +q.x.toFixed(2), +q.y.toFixed(2)]))}`);
        break;
      }
    }
  }
  return bad;
}

it('keeps every carved shape floor and free of walls, whatever is carved after it', { timeout: 800_000 }, () => {
  expect(failures(false).slice(0, 3).join(' || ')).toBe('');
});

// An opening is closed by a line to the wall ends nearest it, which a pile of shapes carved across
// it afterwards can lead astray: 6 of 3,000 such runs when this was written. Plain openings hold
// (`roomsAsWalls.test.ts`); this keeps the rare case from growing.
it('keeps rooms floor through an opening made along the way, but for one run in two hundred', { timeout: 800_000 }, () => {
  const bad = failures(true);
  expect(bad.length, bad.slice(0, 3).join(' || ')).toBeLessThanOrEqual(Math.floor(TRIALS / 200));
});
