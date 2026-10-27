import { stackOf, stairEnd } from '../../../floors/floorStack';
import type { StairEnd } from '../../../floors/stairSpots';
import type { DungeonStair } from '../../../model';
import { rngFrom } from '../../../rng';
import type { Hand } from '../../art/hand';
import { hash2 } from '../../art/noise';
import { polyPath, polysPath } from '../../art/paths';
import type { Vec } from '../../geometry';
import { stoneOutline } from '../../terrain/stones';
import { wayFrame, type WayFrame } from './narrows';
import { rope } from './rope';
import { approachLength, dashes, shaftMouth, type ShaftMouth } from './shaftMouth';
import { layRubbleShadow } from './slopeShading';
import { layDark, layDepth, ledge, rimSurface } from './shaftShading';
import { layAvenLight, poolOf } from './avenLight';

/**
 * A pitch is a shaft in the floor: its rim breaks off, ledges step down into the dark, and a rope
 * tied round a boulder on the approach goes over the near lip and is lost below. An aven is the same
 * shaft seen from beneath: its opening overhead is dashed, its walls rising inside it as dashed
 * contours, and light falls down it onto the floor with the rubble that came down with it.
 */

function seedOf(hand: Hand, frame: WayFrame): number {
  return Math.floor(hash2(frame.bounds.minX, frame.bounds.minY, hand.scene.env.dungeon.model.seed) * 0x7fffffff);
}

/** Short ticks inside the rim pointing down into the shaft, as surveyors mark a pitch; none where the rope goes over. */
function rimTicks(rim: readonly Vec[], centre: Vec, keepClear: Vec): Vec[][] {
  const ticks: Vec[][] = [];
  let since = 0.11;
  for (let i = 0; i < rim.length; i++) {
    const a = rim[i]!;
    const b = rim[(i + 1) % rim.length]!;
    since += Math.hypot(b.x - a.x, b.y - a.y);
    if (since < 0.11 || Math.hypot(a.x - keepClear.x, a.y - keepClear.y) < 0.14) continue;
    since = 0;
    const dx = centre.x - a.x;
    const dy = centre.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const reach = Math.min(0.075, len * 0.2);
    ticks.push([a, { x: a.x + dx / len * reach, y: a.y + dy / len * reach }]);
  }
  return ticks;
}

function pitch(hand: Hand, frame: WayFrame, mouth: ShaftMouth): void {
  const { at, along } = frame;
  const { rings, near } = mouth;
  const rim = rings[0]!;
  rimSurface(hand, rim);
  layDepth(hand, mouth, 0, 2);
  ledge(hand, rings[1]!);
  // The rope is tied on the approach, goes over the near lip and down the lit ledges into the dark.
  const k = Math.min(1, approachLength(along) / 0.85);
  const tie = near - approachLength(along) * 0.52;
  const anchor = [at(-0.2 * k, tie - 0.13 * k), at(0.1 * k, tie - 0.11 * k), at(0.18 * k, tie + 0.04 * k), at(-0.03 * k, tie + 0.13 * k), at(-0.23 * k, tie + 0.03 * k)];
  hand.fill(polyPath(anchor), 'rock');
  hand.line([anchor], 'outline', true);
  const lip = at(0.03, near + 0.03);
  const bottom = rings[3]!;
  const shelf = rings[2]!.reduce((s, p) => ({ x: s.x + p.x / rings[2]!.length, y: s.y + p.y / rings[2]!.length }), { x: 0, y: 0 });
  rope(hand, [
    at(-0.15 * k, tie - 0.04 * k), at(-0.08 * k, tie + 0.08 * k), at(0.08 * k, tie + 0.06 * k), at(0.09 * k, tie - 0.06 * k), at(-0.1 * k, tie - 0.07 * k),
    // It ends inside the lowest ledge, whose dark is laid over it: lost below.
    at(-0.05 * k, tie + 0.16 * k), lip, { x: lip.x * 0.2 + shelf.x * 0.8, y: lip.y * 0.2 + shelf.y * 0.8 },
  ]);
  ledge(hand, rings[2]!);
  layDepth(hand, mouth, 2, 4);
  layDark(hand, mouth);
  hand.line([bottom], 'fine', true);
  // Stone's depth already says which way is down; Engraved, with no tone to spare, marks it as surveyors do.
  if (hand.scene.env.style.direction !== 'stone') hand.line(rimTicks(rim, mouth.centre, lip), 'fine');
  hand.edges(rim, false);
}

function aven(hand: Hand, frame: WayFrame, mouth: ShaftMouth): void {
  const { rings, half } = mouth;
  layAvenLight(hand, frame, mouth);
  // What came down the chimney lies where its light lands: a heap in the middle, stones thrown wider.
  const at = poolOf(mouth).centre;
  const rng = rngFrom(seedOf(hand, frame) + 3);
  const [hx, hy] = frame.down.x ? [half.v, half.u] : [half.u, half.v];
  const stones: { poly: Vec[]; c: Vec; r: number }[] = [];
  for (let i = 0; i < 16; i++) {
    const a = rng() * Math.PI * 2;
    const d = i < 3 ? 0.14 * rng() : 0.12 + Math.sqrt(rng()) * 0.62;
    const c = { x: at.x + Math.cos(a) * d * hx, y: at.y + Math.sin(a) * d * hy };
    const r = i < 3 ? 0.085 + 0.04 * rng() : 0.025 + 0.05 * (1 - d) * rng();
    stones.push({ poly: stoneOutline(rng, c, r), c, r });
  }
  layRubbleShadow(hand, stones.map(s => s.poly), 0.02);
  hand.fill(polysPath(stones.map(s => s.poly)), 'rock');
  hand.solid(polyPath(stones[0]!.poly), stones[0]!.c, stones[0]!.r);
  hand.line(stones.map(s => s.poly), 'fine', true);
  // Overhead, so dashed: the opening's lip, and inside it the chimney's walls rising, as contours;
  // ink, which has no light to show the chimney by, draws one contour more.
  if (hand.scene.env.style.direction !== 'stone') hand.line(dashes(rings[2]!, 0.07, 0.05), 'fine');
  hand.line(dashes(rings[1]!, 0.12, 0.06), 'fine');
  hand.line(dashes(rings[0]!, 0.16, 0.06), 'outline');
}

function drawEnds(hand: Hand, end: StairEnd): void {
  const { dungeon } = hand.scene.env;
  for (const stair of dungeon.floor.stairs) {
    if (stair.way !== 'pitch' || stairEnd(stackOf(dungeon.model), dungeon.index, stair.to) !== end) continue;
    const frame = wayFrame(stair, stair.down);
    const mouth = shaftMouth(frame, mouthSeed(hand, stair));
    if (end === 'upper') pitch(hand, frame, mouth);
    else aven(hand, frame, mouth);
  }
}

/** One seed for both ends of a stairwell, so the aven's opening is the pitch's mouth. */
function mouthSeed(hand: Hand, stair: DungeonStair): number {
  return Math.floor(hash2(stair.link, 0, hand.scene.env.dungeon.model.seed) * 0x7fffffff);
}

export function drawPitches(hand: Hand): void { drawEnds(hand, 'upper'); }
export function drawAvens(hand: Hand): void { drawEnds(hand, 'lower'); }
