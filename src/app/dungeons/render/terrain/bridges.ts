import type { DungeonTerrain } from '../../model';
import { pointsBounds, type Vec } from '../geometry';
import { castShadow, type Hand } from '../art/hand';
import { polyPath, polysPath, type PathFn } from '../art/paths';
import { cellBox } from './cellRings';
import { holeRings } from './holes';
import { cutsHoles, isHole, pieceRng, shownPieces } from './pieces';
import { onCaveFloor } from '../cave/caveArt';
import { band, edgeLine, fillWith, litLip, ticks } from '../vertical/marks';
import { drawRubble, rubbleStone } from '../vertical/rubble';
import { wobbled } from '../vertical/runs';
import { SHADOW_DIR } from '../art/light';
import { withAlpha } from '../palette';

/**
 * Bridges: a rope bridge of planks between two ropes over a hole, its shadow falling into the depth
 * below; a stone slab with kerbs over a channel. Each reaches onto the floor at both ends.
 */

/** How far a bridge reaches onto the floor beyond the cells it spans. */
const REACH = 0.22;

interface Span {
  from: Vec;
  to: Vec;
  /** Along the bridge, and across it. */
  t: Vec;
  n: Vec;
  len: number;
  /** How many cells wide it is: a cave's rock bridge may be two. */
  cells: number;
}

function spanOf(piece: DungeonTerrain): Span {
  const box = cellBox(piece.cells);
  const along = piece.facing ?? (box.w > box.h ? { x: 1, y: 0 } : { x: 0, y: 1 });
  const horizontal = along.x !== 0;
  const from = horizontal ? { x: box.x - REACH, y: box.y + box.h / 2 } : { x: box.x + box.w / 2, y: box.y - REACH };
  const to = horizontal ? { x: box.x + box.w + REACH, y: box.y + box.h / 2 } : { x: box.x + box.w / 2, y: box.y + box.h + REACH };
  const len = Math.hypot(to.x - from.x, to.y - from.y);
  const t = { x: (to.x - from.x) / len, y: (to.y - from.y) / len };
  return { from, to, t, n: { x: -t.y, y: t.x }, len, cells: horizontal ? box.h : box.w };
}

const at = (s: Span, u: number, v: number): Vec => ({ x: s.from.x + s.t.x * u + s.n.x * v, y: s.from.y + s.t.y * u + s.n.y * v });

export function drawBridges(hand: Hand): void {
  const { env } = hand.scene;
  const terrain = env.dungeon.floor.terrain;
  for (const bridge of shownPieces(env, new Set(['bridge']))) {
    const under = terrain[bridge.spans ?? -1];
    if (!under) continue;
    const natural = onCaveFloor(env) && isHole(under) && bridge.name !== 'dungeon.terrain.ropeBridge';
    if (natural) naturalBridge(hand, bridge, polysPath(holeRings(under, env)));
    else if (isHole(under)) ropeBridge(hand, bridge, polysPath(holeRings(under, env)), cutsHoles(env));
    else stoneBridge(hand, bridge);
  }
}

/** Planks with gaps between two sagging ropes, a post at each corner; over a cut hole the deck's own shadow fills what lies under it. */
function ropeBridge(hand: Hand, piece: DungeonTerrain, depths: PathFn, cut: boolean): void {
  const s = spanOf(piece);
  const half = 0.36;
  const rng = pieceRng(hand.scene.env, piece);
  const deck = [at(s, 0, -half), at(s, s.len, -half), at(s, s.len, half), at(s, 0, half)];
  if (cut) {
    // What is under the deck is its shadow, never the level below: the cell is floor there.
    hand.surface(polyPath([at(s, REACH, -half - 0.02), at(s, s.len - REACH, -half - 0.02), at(s, s.len - REACH, half + 0.02), at(s, REACH, half + 0.02)]), 'rock');
    hand.tone(() => 0.85, pointsBounds(deck), polyPath(deck), 'depth');
  } else castShadow(hand, polyPath(deck), 0.9, pointsBounds(deck), 0.75, depths);
  const planks: Vec[][] = [];
  for (let u = 0.06; u < s.len - 0.08; u += 0.13) {
    if (rng() < 0.05) continue;
    const skew = (rng() - 0.5) * 0.03;
    const w = 0.085 + rng() * 0.015;
    const hh = half * (0.84 + rng() * 0.08);
    const shift = (rng() - 0.5) * 0.04;
    planks.push([at(s, u + skew, -hh + shift), at(s, u + w + skew, -hh + shift), at(s, u + w - skew, hh + shift), at(s, u - skew, hh + shift)]);
  }
  hand.surface(polysPath(planks), 'wood');
  for (const p of planks) hand.edges(p, true);
  const ropes = [-1, 1].map(side => Array.from({ length: 25 }, (_, k) => at(s, -0.05 + ((s.len + 0.1) * k) / 24, side * (half - 0.025) + Math.sin((Math.PI * k) / 24) * 0.03 * side)));
  hand.line(ropes, 'heavy');
  const posts = [at(s, -0.06, -half + 0.02), at(s, -0.06, half - 0.02), at(s, s.len + 0.06, -half + 0.02), at(s, s.len + 0.06, half - 0.02)];
  for (const p of posts) {
    const sq = [{ x: p.x - 0.065, y: p.y - 0.065 }, { x: p.x + 0.065, y: p.y - 0.065 }, { x: p.x + 0.065, y: p.y + 0.065 }, { x: p.x - 0.065, y: p.y + 0.065 }];
    castShadow(hand, polyPath(sq), 0.2, pointsBounds(sq), 0.6);
    hand.surface(polyPath(sq), 'wood');
    hand.edges(sq, true);
  }
}

/** A stone slab over a channel, kerbs along its sides, its shadow on the flow below. */
function stoneBridge(hand: Hand, piece: DungeonTerrain): void {
  const s = spanOf(piece);
  const half = 0.4;
  const deck = [at(s, 0, -half), at(s, s.len, -half), at(s, s.len, half), at(s, 0, half)];
  castShadow(hand, polyPath(deck), 0.35, pointsBounds(deck), 0.7);
  hand.surface(polyPath(deck), 'dressed');
  const joints: Vec[][] = [];
  for (let u = 0.3; u < s.len - 0.12; u += 0.34) joints.push([at(s, u, -half + 0.09), at(s, u, half - 0.09)]);
  hand.line(joints, 'fine');
  for (const side of [-1, 1]) {
    const kerb = [at(s, 0, side * half), at(s, s.len, side * half), at(s, s.len, side * (half - 0.09)), at(s, 0, side * (half - 0.09))];
    hand.surface(polyPath(kerb), 'dressed');
    hand.edges(kerb, true);
  }
  hand.edges(deck, true);
}

/**
 * A natural bridge of rock over a cave's chasm: a strip of floor across the gap, its two sides the
 * chasm's rims carried over it, their ticks hanging into the dark; its shadow falls on the chasm
 * below and to the right of it, ten feet of rock thick, and a chockstone is wedged under its side.
 */
function naturalBridge(hand: Hand, piece: DungeonTerrain, depths: PathFn): void {
  const s = spanOf(piece);
  const rng = pieceRng(hand.scene.env, piece);
  const seed = piece.id * 37 + 11;
  const side = (v: number): Vec[] => wobbled(Array.from({ length: 9 }, (_, k) => at(s, (s.len * k) / 8, v)), seed + v * 10, 0.04);
  // A bridge two cells wide keeps the same rim inside its outer cells.
  const half = 0.38 + (s.cells - 1) / 2;
  // Along the span, a side's left is −v: the near side's outside, the far side's inside.
  const near = side(-half);
  const far = side(half);
  const deck = [...near, ...far.slice().reverse()];
  const { ctx } = hand.scene.env;
  const drop = band(10);
  ctx.save();
  ctx.beginPath();
  depths(ctx);
  ctx.clip();
  fillWith(hand, polyPath(deck.map(p => ({ x: p.x + SHADOW_DIR.x * drop, y: p.y + SHADOW_DIR.y * drop }))), withAlpha('#000000', 0.45));
  const chock = at(s, s.len / 2 + (rng() - 0.5) * 0.3, (rng() < 0.5 ? -1 : 1) * (half + 0.17));
  drawRubble(hand, [rubbleStone(rng, chock, 0.11 + 0.04 * rng())]);
  ctx.restore();
  hand.fill(polyPath(deck), 'floor');
  // Its sides only over the gap: on the floor either end the bridge is floor.
  ctx.save();
  ctx.beginPath();
  depths(ctx);
  ctx.clip();
  for (const [run, low] of [[near, 1], [far, -1]] as const) {
    ticks(hand, run, low, drop * 0.6, { seed });
    edgeLine(hand, run, low, false, seed);
    litLip(hand, run, low);
  }
  ctx.restore();
}
