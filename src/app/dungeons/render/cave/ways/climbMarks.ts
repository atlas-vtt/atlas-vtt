import type { Hand, PileStone } from '../../art/hand';
import { valueNoise } from '../../art/noise';
import { crayonPaint } from '../../crayon/tooth';
import type { Vec } from '../../geometry';
import { withAlpha } from '../../palette';
import { clearOfCaveWall } from '../../terrain/pieces';
import { catchesLight, inkOf, lookOf, strokeWith } from '../../vertical/marks';
import { rubbleStone } from '../../vertical/rubble';
import { along, normalsOf, offsetRun, resampled } from '../../vertical/runs';

/**
 * The parts of an in-floor climb that make it read as a step at play zoom rather than a stray line
 * (as surveys and Roberts draw one): the walls it runs between, cross-hatch where it meets them,
 * crayon's pressed edge and its paper lip, and the rubble at its foot.
 */

/** How far a step's line is looked along for a wall, in cells either way: past it the step ends in the open. */
const WALL_SEARCH = 3;
/** The least step of the search, in cells. */
const LEAST_STEP = 0.02;

/**
 * How far from `from` along `dir` (a unit vector) the floor ends, in cells, found to a hundredth;
 * `WALL_SEARCH` where no wall stands that near, and 0 where `from` is not on the floor. It steps by
 * the distance to the nearest wall, which no step can pass, so it asks the field a few times
 * rather than at every hundredth of a cell.
 */
export function wallAlong(hand: Hand, from: Vec, dir: Vec): number {
  const { field } = hand.scene.env.dungeon;
  const depth = (d: number): number => field.distance(from.x + dir.x * d, from.y + dir.y * d);
  if (depth(0) >= 0) return 0;
  let lo = 0;
  let hi = WALL_SEARCH;
  for (let d = 0; d < WALL_SEARCH;) {
    const inside = -depth(d);
    if (inside <= 0) {
      hi = d;
      break;
    }
    lo = d;
    d += Math.max(inside, LEAST_STEP);
  }
  if (hi === WALL_SEARCH && depth(hi) < 0) return WALL_SEARCH;
  while (hi - lo > 0.01) {
    const mid = (lo + hi) / 2;
    if (depth(mid) < 0) lo = mid;
    else hi = mid;
  }
  return lo;
}

/** How far along the step from each end its corners against the walls are cross-hatched, in cells. */
const CORNER = 0.3;
/** The hatch's spacing along the step, in cells. */
const HATCH = 0.045;

/**
 * Cross-hatch on the low side where the step meets each wall, where the shadow is deepest (Roberts'
 * corners): two slants crossing, longest at the wall and shortening along the step. `walls` are the
 * distances along the run, in cells, at which it meets the walls.
 */
export function cornerHatch(hand: Hand, run: readonly Vec[], low: number, width: number, walls: readonly [number, number]): void {
  const lines: Vec[][] = [];
  const points = along(run, HATCH, 0);
  points.forEach(({ p, t, n }, k) => {
    const s = k * HATCH;
    const fromWall = Math.min(Math.abs(s - walls[0]), Math.abs(walls[1] - s));
    if (fromWall > CORNER || s < walls[0] - 0.05 || s > walls[1] + 0.05) return;
    const len = width * (1.1 - fromWall / CORNER * 0.6);
    const out = { x: n.x * low, y: n.y * low };
    for (const lean of [-0.6, 0.6]) {
      const d = { x: out.x + t.x * lean, y: out.y + t.y * lean };
      const a = { x: p.x + out.x * 0.02, y: p.y + out.y * 0.02 };
      lines.push([a, { x: a.x + d.x * len, y: a.y + d.y * len }]);
    }
  });
  if (lines.length) strokeWith(hand, lines, withAlpha(inkOf(hand), lookOf(hand) === 'crayon' ? 0.7 : 0.8), hand.weight('fine'));
}

/** Crayon's edge of a step: one heavy stroke, `width` cells, firm where the hand presses, paler where it lifts and gone in a few short gaps. */
export function pressedEdge(hand: Hand, run: readonly Vec[], seed: number, width: number): void {
  const ink = inkOf(hand);
  const firm: Vec[][] = [];
  const light: Vec[][] = [];
  let piece: Vec[] = [];
  let pressing = true;
  const flush = (): void => {
    if (piece.length > 1) (pressing ? firm : light).push(piece);
    piece = [];
  };
  for (const p of resampled(run, 0.05)) {
    const pressure = valueNoise(p.x * 2.6, p.y * 2.6, seed);
    if (pressure > 0.84) {
      flush();
      continue;
    }
    const now = pressure < 0.62;
    if (now !== pressing) {
      const last = piece[piece.length - 1];
      flush();
      if (last) piece.push(last);
      pressing = now;
    }
    piece.push(p);
  }
  flush();
  strokeWith(hand, firm, withAlpha(ink, 0.92), width);
  strokeWith(hand, light, withAlpha(ink, 0.55), width * 0.75);
}

/** Crayon's lit lip: a strip of the paper's tooth left bare on the high side, where it faces the light. */
export function paperLip(hand: Hand, run: readonly Vec[], low: number): void {
  if (lookOf(hand) !== 'crayon' || hand.scene.env.view.monochrome) return;
  const normals = normalsOf(run);
  const high = offsetRun(run, normals, () => 0.05, -low);
  const lit: Vec[][] = [];
  let piece: Vec[] = [];
  high.forEach((p, i) => {
    if (catchesLight({ x: normals[i]!.x * low, y: normals[i]!.y * low }) > 0.1) piece.push(p);
    else if (piece.length) {
      if (piece.length > 1) lit.push(piece);
      piece = [];
    }
  });
  if (piece.length > 1) lit.push(piece);
  if (!lit.length) return;
  const { ctx } = hand.scene.env;
  const paper = hand.scene.env.palette.paper;
  // On the paper's tooth, so it reads as paper the crayon skipped rather than a painted line.
  strokeWith(hand, lit, hand.scene.raster ? crayonPaint(ctx, paper) : paper, 0.035);
}

/** How far past the band rubble spreads at most, in cells. */
const SPREAD = 0.8;

/**
 * The rubble that broke off a step's face, at its foot: 3 to 8 angular pieces 0.05 to 0.15 cells
 * across, crowded in the band and spreading 0.3 to 0.8 cells beyond it, more near the walls than in
 * the middle, and grit between them. A pitch and a chimney shed alike, so the two differ only by
 * the rope a pitch is rigged with.
 */
export function footRubble(hand: Hand, rng: () => number, run: readonly Vec[], down: Vec, width: number): PileStone[] {
  const stones: PileStone[] = [];
  const env = hand.scene.env;
  const at = (k: number, d: number): Vec => ({ x: run[k]!.x + down.x * d, y: run[k]!.y + down.y * d });
  const towardsWalls = (): number => {
    const s = rng();
    return Math.round((s < 0.5 ? s * s * 2 : 1 - (1 - s) * (1 - s) * 2) * (run.length - 1));
  };
  const count = 3 + Math.floor(rng() * 6);
  for (let i = 0; i < count * 3 && stones.length < count; i++) {
    const r = 0.03 + 0.045 * rng() * rng();
    const beyond = rng() < 0.35;
    const d = beyond ? width + 0.3 + (SPREAD - 0.3) * rng() : width * (0.2 + 0.75 * rng());
    const c = at(towardsWalls(), Math.max(r + 0.03, d));
    if (clearOfCaveWall(env, c, r)) stones.push(rubbleStone(rng, c, r));
  }
  // Grit between the pieces, in the band.
  for (let i = 0; i < count; i++) {
    const r = 0.01 + 0.012 * rng();
    const c = at(towardsWalls(), width * (0.15 + 0.9 * rng()));
    if (clearOfCaveWall(env, c, r)) stones.push(rubbleStone(rng, c, r));
  }
  return stones;
}
