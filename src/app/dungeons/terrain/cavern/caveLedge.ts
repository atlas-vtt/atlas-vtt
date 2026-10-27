/**
 * A ledge along the bank of what flows through a cave (lava, above all): a raised shelf of rock a
 * cell wide beside the channel, two to six cells long, stepping down at one end.
 */

import { cellKey } from '../../geometry';
import type { CellDir, CellPoint } from '../../model';
import { type Rng, chance } from '../../rng';
import { type TerrainDraft, draft } from '../catalog';
import type { RoomCells } from '../roomCells';
import { principalAxis } from './faultBand';

const STEPS: readonly CellDir[] = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
];
const LONGEST = 6;

/** The ledge beside `band` on the side with the longest free run, and the cell at the foot of its steps; null where none is two cells long. */
export function bankLedge(rc: RoomCells, rng: Rng, band: readonly CellPoint[]): { ledge: TerrainDraft; foot: CellPoint[] } | null {
  const own = new Set(band.map((c) => cellKey(c.x, c.y)));
  const { angle } = principalAxis(band);
  const mx = band.reduce((s, c) => s + c.x, 0) / band.length;
  const my = band.reduce((s, c) => s + c.y, 0) / band.length;
  const side = (c: CellPoint): number => Math.sign((c.x - mx) * Math.sin(angle) - (c.y - my) * Math.cos(angle));
  const bank = new Map<string, CellPoint>();
  for (const c of band) for (const d of STEPS) {
    const n = { x: c.x + d.x, y: c.y + d.y };
    const key = cellKey(n.x, n.y);
    if (!own.has(key) && rc.fits([n]) && !rc.inLane(n) && !rc.nearStairs(n)) bank.set(key, n);
  }
  const sides = chance(rng, 0.5) ? [1, -1] : [-1, 1];
  let best: CellPoint[] = [];
  for (const s of sides) {
    const cells = [...bank.values()].filter((c) => side(c) === s);
    const left = new Set(cells.map((c) => cellKey(c.x, c.y)));
    for (const start of cells) {
      if (!left.has(cellKey(start.x, start.y))) continue;
      const run: CellPoint[] = [start];
      left.delete(cellKey(start.x, start.y));
      for (let at = 0; at < run.length && run.length < LONGEST; at++) {
        for (const d of STEPS) {
          const n = { x: run[at]!.x + d.x, y: run[at]!.y + d.y };
          if (run.length < LONGEST && left.delete(cellKey(n.x, n.y))) run.push(n);
        }
      }
      if (run.length > best.length) best = run;
    }
  }
  if (best.length < 2) return null;
  const inLedge = new Set(best.map((c) => cellKey(c.x, c.y)));
  for (const step of [best[best.length - 1]!, best[0]!]) {
    for (const d of STEPS) {
      const foot = { x: step.x + d.x, y: step.y + d.y };
      const key = cellKey(foot.x, foot.y);
      if (inLedge.has(key) || own.has(key) || !rc.isFloor(foot) || rc.isBlocked(foot)) continue;
      return { ledge: draft('ledge', rc.room.id, best, { facing: d, steps: [step] }), foot: [foot] };
    }
  }
  return null;
}
