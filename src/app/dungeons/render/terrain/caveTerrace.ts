import type { CellDir, DungeonTerrain } from '../../model';
import { rngFrom } from '../../rng';
import type { Hand } from '../art/hand';
import type { Vec } from '../geometry';
import { insetRuns } from '../shore';
import { band, edgeLine, litLip, lowBand, ticks } from '../vertical/marks';
import { drawRubble, insideOf, rubbleStone } from '../vertical/rubble';
import { bowed, normalsOf, wobbled } from '../vertical/runs';
import { cellRings } from './cellRings';
import { cellSet, clearOfCaveWall } from './pieces';
import { raggedRing, type RaggedShape } from './scatterPatch';

/**
 * A ledge or platform on a cave's floor: no slabs, the floor goes on over it, only its edge where
 * it steps down, as Dyson Logos draws a tier. The edge wanders through its cells, never along a
 * cell line, and is drawn only where open floor lies below it, so it runs from wall to wall; its
 * low side carries a band as wide as the ledge is high (five feet a step), ticks and rubble under
 * its bulges, where rock broke off. A ledge two steps high or more shows its upper tier inside it,
 * fainter. Where its steps lead up, rough treads cross its end instead.
 */

/** Held a little inside its cells, so the edge stays on them; softer than a crack, it is worn rock. */
const TERRACE: RaggedShape = { sigma: 1.6, waves: 1.3, swell: 0.12, rag: 0.05, outwards: -0.1 };

/** The runs of an edge that look out over open floor of the room, away from the steps. */
function openRuns(hand: Hand, piece: DungeonTerrain, ring: readonly Vec[], low: number): Vec[][] {
  const own = cellSet(piece.cells);
  const steps = cellSet(piece.steps ?? []);
  const facing = piece.facing;
  const normals = normalsOf(ring, true);
  const { field } = hand.scene.env.dungeon;
  const runs: Vec[][] = [];
  let run: Vec[] = [];
  ring.forEach((p, i) => {
    const out = { x: normals[i]!.x * low, y: normals[i]!.y * low };
    const q = { x: p.x + out.x * 0.25, y: p.y + out.y * 0.25 };
    const atSteps = facing !== undefined && steps.has(`${Math.floor(p.x)},${Math.floor(p.y)}`) && out.x * facing.x + out.y * facing.y > 0.5;
    // Open floor just below the edge, not the ledge's own cells: wherever a wall's ink wanders close, the edge meets it there.
    if (!own.has(`${Math.floor(q.x)},${Math.floor(q.y)}`) && field.distance(q.x, q.y) < -0.02 && !atSteps) run.push(p);
    else {
      if (run.length > 2) runs.push(run);
      run = [];
    }
  });
  if (run.length > 2) {
    // A run round the start of the ring joins the first.
    if (runs.length && ring.indexOf(runs[0]![0]!) === 0) runs[0] = [...run, ...runs[0]!];
    else runs.push(run);
  }
  return runs;
}

/** Rubble under the edge where it bulges out: where rock broke off it. */
function brokenOff(hand: Hand, run: readonly Vec[], low: number, width: number, seed: number): ReturnType<typeof rubbleStone>[] {
  const rng = rngFrom(seed);
  const normals = normalsOf(run);
  const stones: ReturnType<typeof rubbleStone>[] = [];
  for (let k = 3; k < run.length - 3; k += 4) {
    const p = run[k]!;
    const mid = { x: (run[k - 3]!.x + run[k + 3]!.x) / 2, y: (run[k - 3]!.y + run[k + 3]!.y) / 2 };
    const out = { x: normals[k]!.x * low, y: normals[k]!.y * low };
    // Farther out than its neighbours' middle: a bulge.
    if ((p.x - mid.x) * out.x + (p.y - mid.y) * out.y < 0.012) continue;
    for (let i = 0; i < 2; i++) {
      const d = width * (0.4 + 0.9 * rng());
      const c = { x: p.x + out.x * d + (rng() - 0.5) * 0.12, y: p.y + out.y * d + (rng() - 0.5) * 0.12 };
      const r = 0.025 + 0.04 * rng();
      if (clearOfCaveWall(hand.scene.env, c, r)) stones.push(rubbleStone(rng, c, r));
    }
  }
  return stones;
}

/** An edge of the terrace: band, rubble, ticks, line and lit lip, `strength` fainter for an upper tier. */
function terraceEdge(hand: Hand, run: Vec[], low: number, feet: number, seed: number, strength = 1): void {
  const width = band(feet);
  lowBand(hand, run, low, width, { strength });
  drawRubble(hand, brokenOff(hand, run, low, width, seed));
  ticks(hand, run, low, width * 0.8, { seed });
  edgeLine(hand, run, low, false, seed);
  litLip(hand, run, low);
}

/** Rough treads up the steps' cell: short bowed edges across it, each with its ticks hanging down the step below it. */
function treads(hand: Hand, cell: Vec, facing: CellDir, seed: number): void {
  const across = { x: -facing.y, y: facing.x };
  for (const [k, v] of [0.18, -0.12, -0.38].entries()) {
    // From the foot up: each tread a little farther back towards the top.
    const o = { x: cell.x + 0.5 + facing.x * v, y: cell.y + 0.5 + facing.y * v };
    const w = 0.42 - k * 0.03;
    const a = { x: o.x - across.x * w, y: o.y - across.y * w };
    const b = { x: o.x + across.x * w, y: o.y + across.y * w };
    const run = wobbled(bowed(a, b, 0.05 * (k % 2 ? 1 : -1), 6), seed + k, 0.02);
    // The run's left is `facing` turned a quarter back: down the steps is `facing`.
    const left = { x: across.y, y: -across.x };
    const low = left.x * facing.x + left.y * facing.y > 0 ? 1 : -1;
    ticks(hand, run, low, band(3), { seed: seed + k });
    edgeLine(hand, run, low, false, seed + k);
  }
}

export function drawCaveTerrace(hand: Hand, piece: DungeonTerrain): void {
  const { env } = hand.scene;
  const steps = Math.max(1, piece.traits.elevation ?? 1);
  const seed = env.dungeon.model.seed + piece.id * 23 + 977;
  const { ctx } = env;
  ctx.save();
  ctx.beginPath();
  for (const ring of hand.scene.floorRings) {
    ctx.moveTo(ring[0]!.x, ring[0]!.y);
    for (const p of ring.slice(1)) ctx.lineTo(p.x, p.y);
    ctx.closePath();
  }
  ctx.clip();
  for (const cellRing of cellRings(piece.cells)) {
    const ring = raggedRing(cellRing, seed, TERRACE);
    const low = -insideOf(ring);
    for (const run of openRuns(hand, piece, ring, low)) terraceEdge(hand, run, low, 5 * steps, seed);
    // The upper tier of a ledge two steps high or more, inside it.
    if (steps >= 2) for (const run of insetRuns(ring, 0.42)) terraceEdge(hand, run, low, 5 * (steps - 1), seed + 5, 0.7);
  }
  if (piece.facing) for (const cell of piece.steps ?? []) treads(hand, cell, piece.facing, seed + 9);
  ctx.restore();
}
