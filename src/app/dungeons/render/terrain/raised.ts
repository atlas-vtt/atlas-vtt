import type { CellDir, CellPoint, DungeonTerrain } from '../../model';
import type { Vec } from '../geometry';
import type { Hand } from '../art/hand';
import { polyPath, polysPath, rectPoly } from '../art/paths';
import { cellRings, edgesFacing } from './cellRings';
import { cellSet, onFloor } from './pieces';

/**
 * Height without a word (Map-Fu): a platform or ledge is a top of dressed slabs, lighter than the
 * floor and laid a cell a slab, standing up from it with a lit lip and a shaded one, casting its
 * shadow (the scene's, longer the higher it stands); ticks hang from its open sides, longer and
 * closer the higher it stands, as on a survey's slope; its steps lead up from the floor, each
 * tread darker towards the foot.
 */

export function drawRaised(hand: Hand, piece: DungeonTerrain): void {
  const height = Math.max(1, piece.traits.elevation ?? 1);
  const rings = cellRings(piece.cells);
  const own = cellSet(piece.cells);
  hachures(hand, piece.cells, height, c => !own.has(`${c.x},${c.y}`) && onFloor(hand.scene.env, c), cellSet(piece.steps ?? []));
  hand.surface(polysPath(rings), 'raised');
  const slabs: Vec[][] = [];
  for (const c of piece.cells) {
    if (own.has(`${c.x + 1},${c.y}`)) slabs.push([{ x: c.x + 1, y: c.y }, { x: c.x + 1, y: c.y + 1 }]);
    if (own.has(`${c.x},${c.y + 1}`)) slabs.push([{ x: c.x, y: c.y + 1 }, { x: c.x + 1, y: c.y + 1 }]);
  }
  hand.line(slabs, 'fine');
  for (const ring of rings) hand.edges(ring, true);
  if (piece.steps && piece.facing) for (const c of piece.steps) drawStepCell(hand, c, piece.facing);
}

/** Short ticks standing out from every open side of a raised floor, longer and closer the higher it stands; none where steps lead up. */
function hachures(hand: Hand, cells: readonly CellPoint[], height: number, open: (c: CellPoint) => boolean, steps: ReadonlySet<string>): void {
  const length = 0.07 + 0.07 * height;
  const spacing = 0.14 / Math.sqrt(height);
  const runs: Vec[][] = [];
  for (const e of edgesFacing(cells, open)) {
    const d = { x: e.to.x - e.from.x, y: e.to.y - e.from.y };
    const len = Math.hypot(d.x, d.y);
    const out = { x: d.y / len, y: -d.x / len };
    // The cell outside this edge: steps there lead up, so no ticks.
    const mid = { x: (e.from.x + e.to.x) / 2 + out.x * 0.5, y: (e.from.y + e.to.y) / 2 + out.y * 0.5 };
    if (steps.has(`${Math.floor(mid.x)},${Math.floor(mid.y)}`)) continue;
    for (let u = spacing / 2; u < len; u += spacing) {
      const p = { x: e.from.x + (d.x * u) / len, y: e.from.y + (d.y * u) / len };
      const l = Math.floor(u / spacing) % 2 === 0 ? length : length * 0.6;
      runs.push([{ x: p.x + out.x * 0.012, y: p.y + out.y * 0.012 }, { x: p.x + out.x * (0.012 + l), y: p.y + out.y * (0.012 + l) }]);
    }
  }
  hand.line(runs, 'outline');
}

/** A cell of steps descending towards `down`: treads across it, each one's foot in the shadow of the one above. */
export function drawStepCell(hand: Hand, c: CellPoint, down: CellDir): void {
  drawFlight(hand, { x: c.x, y: c.y, w: 1, h: 1 }, down, 0.04);
}

/**
 * A flight of treads across a rectangle, descending towards `down`, `margin` in from its sides:
 * each tread lit along its nosing, its foot shaded by the tread above, darker the lower it lies.
 */
export function drawFlight(hand: Hand, r: { x: number; y: number; w: number; h: number }, down: CellDir, margin = 0, tread = 0.2): void {
  const along = down.x !== 0 ? r.w : r.h;
  const n = Math.max(2, Math.round(along / tread));
  const poly = rectPoly(r);
  hand.surface(polyPath(poly), 'dressed');
  const t = (x: number, y: number): number => (down.x > 0 ? (x - r.x) / r.w : down.x < 0 ? (r.x + r.w - x) / r.w : down.y > 0 ? (y - r.y) / r.h : (r.y + r.h - y) / r.h);
  hand.tone(
    (x, y) => {
      const u = Math.max(0, Math.min(0.999, t(x, y)));
      const k = Math.floor(u * n);
      const within = u * n - k;
      return 0.04 + 0.26 * (k / n) + 0.4 * Math.max(0, 1 - within / 0.5) * (0.25 + 0.75 * (k / n));
    },
    { minX: r.x, minY: r.y, maxX: r.x + r.w, maxY: r.y + r.h },
    polyPath(poly),
    'shade',
  );
  const nosings: Vec[][] = [];
  for (let k = 1; k < n; k++) {
    const u = k / n;
    if (down.x !== 0) {
      const x = down.x > 0 ? r.x + r.w * u : r.x + r.w * (1 - u);
      nosings.push([{ x, y: r.y + margin }, { x, y: r.y + r.h - margin }]);
    } else {
      const y = down.y > 0 ? r.y + r.h * u : r.y + r.h * (1 - u);
      nosings.push([{ x: r.x + margin, y }, { x: r.x + r.w - margin, y }]);
    }
  }
  hand.line(nosings, 'outline');
}
