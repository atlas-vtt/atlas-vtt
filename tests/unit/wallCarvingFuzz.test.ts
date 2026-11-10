/// <reference types="vite/client" />
import { expect, it } from 'vitest';
import { areaOf, type RoomArea } from '../../src/app/lighting/rooms';
import { carvedWalls } from '../../src/app/lighting/wallCarving';
import { enclosedSpaces, isRockBetweenRooms } from '../../src/app/lighting/wallSpaces';
import { sealedWalls } from '../../src/app/lighting/sealWalls';
import { shapeContains } from '../../src/app/lighting/shapeContains';
import type { WallSegment } from '../../src/app/types/wallTypes';

type P = { x: number; y: number };
let n = 0;
const rectArea = (a: P, b: P): RoomArea => areaOf([[{ x: a.x, y: a.y }, { x: b.x, y: a.y }, { x: b.x, y: b.y }, { x: a.x, y: b.y }]]);
const floorsOf = (walls: WallSegment[]): RoomArea[] => enclosedSpaces(sealedWalls(walls, 2)).filter((s) => !isRockBetweenRooms(s, walls));
function carve(walls: WallSegment[], area: RoomArea): WallSegment[] {
  const { remove, add } = carvedWalls(area, walls, floorsOf(walls), `c${n}`);
  return [...walls.filter((w) => !remove.includes(w.id)), ...add.map((w) => ({ ...w, id: `w${n++}`, kind: 'wall' as const }))];
}
const next = (seed: number): (() => number) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);

/** More runs with `VITE_CARVE_TRIALS` (12,000 take half a minute). */
const TRIALS = Number(import.meta.env.VITE_CARVE_TRIALS ?? 300);

/**
 * Rectangles carved one after another, on a grid (shared edges and corners, as Shift snaps), freely,
 * and a pixel or so off each other's lines (as a hand draws): every shape carved stays floor, and
 * no wall is left inside any of them.
 */
it('keeps every carved shape floor and free of walls, whatever is carved after it', { timeout: 800_000 }, () => {
  const bad: string[] = [];
  for (let seed = 1; seed <= TRIALS && bad.length < 5; seed++) {
    const random = next(seed);
    const kind = seed % 3;
    const at = (): number => (kind === 0 ? Math.round(random() * 10) * 75 : kind === 1 ? random() * 750 : Math.round(random() * 10) * 75 + (random() - 0.5) * 3);
    let walls: WallSegment[] = [];
    const carved: { a: P; b: P }[] = [];
    for (let step = 0; step < 7; step++) {
      const [x1, y1, x2, y2] = [at(), at(), at(), at()];
      if (Math.abs(x1 - x2) < 30 || Math.abs(y1 - y2) < 30) continue;
      const [a, b] = [{ x: Math.min(x1, x2), y: Math.min(y1, y2) }, { x: Math.max(x1, x2), y: Math.max(y1, y2) }];
      walls = carve(walls, rectArea(a, b));
      carved.push({ a, b });
      const floors = floorsOf(walls);
      let rock = 0;
      for (const { a: p, b: q } of carved) for (const share of [0.2, 0.5, 0.8]) {
        if (!floors.some((s) => shapeContains(s, { x: p.x + share * (q.x - p.x), y: p.y + (1 - share) * (q.y - p.y) }))) rock++;
      }
      const inside = walls.filter(({ p1, p2 }) => carved.some(({ a: p, b: q }) => (p1.x + p2.x) / 2 > p.x + 3 && (p1.x + p2.x) / 2 < q.x - 3 && (p1.y + p2.y) / 2 > p.y + 3 && (p1.y + p2.y) / 2 < q.y - 3));
      if (rock > 0 || inside.length > 0) {
        bad.push(`seed ${seed} kind ${kind} step ${step}: rock ${rock} inside ${inside.length} carved ${JSON.stringify(carved.map(({ a: p, b: q }) => [+p.x.toFixed(2), +p.y.toFixed(2), +q.x.toFixed(2), +q.y.toFixed(2)]))}`);
        break;
      }
    }
  }
  expect(bad.join('\n')).toBe('');
});
