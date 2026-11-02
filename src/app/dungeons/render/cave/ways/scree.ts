import { stackOf, stairEnd } from '../../../floors/floorStack';
import type { StairEnd } from '../../../floors/stairSpots';
import { doorCells } from '../../../geometry';
import type { CellDir, DungeonDoor } from '../../../model';
import type { Hand } from '../../art/hand';
import { polyPath, polysPath, type PathFn } from '../../art/paths';
import { pointsBounds, type Bounds, type Vec } from '../../geometry';
import { withAlpha } from '../../palette';
import { band, edgeLine, fillWith, inkOf, litLip, lookOf, lowBands, strokeWith, ticks } from '../../vertical/marks';
import { drawRubble, insideOf } from '../../vertical/rubble';
import { wayFrame, type WayFrame } from './narrows';
import { neckFaces } from './pinch';
import { screeSlope, slopeArea, type ScreeSlope } from './screeShape';
import { dashes } from './shaftMouth';
import { stoneOf } from './wayColours';
import { slopeSeed } from './wayOutline';
import { boundedCached } from '../../boundedCache';

const SLOPES = new Map<string, ScreeSlope>();

/**
 * A scree slope between two heights, as surveys and Dyson Logos draw one (`screeShape.ts` for its
 * lines): darker the farther down it goes, ten feet a floor or ten for a step between rooms;
 * contours across it closer where it is steep, wedges down its fall line, grit high up and blocks
 * at its foot. Its edges carry the band of every drop, as wide as the drop beside them is deep.
 * It is drawn on its own cells (the stairwell, or a steps door's cell and the next) and the
 * floor only, never over the walls' ink.
 */

/** How far down the slope a point lies, 0 at its head and 1 at its foot. */
function slopeT(frame: WayFrame, slope: ScreeSlope): (p: Vec) => number {
  const o = frame.at(0, 0);
  const { down } = frame;
  const top = slope.vAt(0);
  const length = slope.vAt(1) - top;
  return p => Math.max(0, Math.min(1, (((p.x - o.x) * down.x + (p.y - o.y) * down.y) - top) / length));
}

/** The slope's own area: inside its edge from above, between its sides from below, across the passage between rooms. */
/** Darker down the slope, a tenth for every five feet it falls: a gradient in ink, pressure in crayon, hatching in the engraving. */
function gradedSlope(hand: Hand, path: PathFn, bounds: Bounds, frame: WayFrame, slope: ScreeSlope, t: (p: Vec) => number, feet: number): void {
  const deepest = Math.min(0.5, 0.08 + 0.02 * feet);
  const c = stoneOf(hand);
  if (c && hand.scene.raster) {
    const a = frame.at(0, slope.vAt(0));
    // From below and between rooms the slope runs out onto the floor: its tone fades out at the foot, never a hard line.
    const runsOut = !slope.ring;
    const b = frame.at(0, slope.vAt(1) + (slope.area ? 0.3 : 0));
    const g = hand.scene.env.ctx.createLinearGradient(a.x, a.y, b.x, b.y);
    const shade = c.dark ? '#000000' : c.shadow;
    g.addColorStop(0, withAlpha(shade, 0.03));
    if (runsOut) g.addColorStop(0.7, withAlpha(shade, deepest * 0.8));
    g.addColorStop(1, withAlpha(shade, runsOut ? 0 : deepest));
    const { ctx } = hand.scene.env;
    ctx.save();
    ctx.beginPath();
    path(ctx);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.restore();
    return;
  }
  if (c) return;
  if (hand.waxStroke) {
    // Broad strokes down the fall line, a second layer over the lower part: heavier as it goes down, and from below lighter again where it reaches the floor.
    const end = slope.ring ? 1 : 0.88;
    const runs = (from: number, salt: number): Vec[][] => {
      const out: Vec[][] = [];
      for (let u = -frame.across / 2 + 0.06 * salt; u < frame.across / 2; u += 0.13) {
        const start = from + 0.12 * Math.abs(Math.sin(u * 17 + salt));
        out.push([frame.at(u, slope.vAt(start)), frame.at(u + 0.03, slope.vAt(end - 0.05 * Math.abs(Math.cos(u * 11 + salt))))]);
      }
      return out;
    };
    ctxClip(hand, path, () => {
      hand.waxStroke!(runs(0.2, 1), 0.15, 0.12 + 0.01 * feet);
      hand.waxStroke!(runs(0.55, 2), 0.13, 0.1 + 0.01 * feet);
    });
    return;
  }
  // The engraving: short strokes down the fall line, closer together the farther down, none on the upper third.
  const strokes: Vec[][] = [];
  const across = frame.across / 2;
  for (let v = slope.vAt(0.35); v < slope.vAt(1); v += 0.07) {
    const k = (v - slope.vAt(0)) / (slope.vAt(1) - slope.vAt(0));
    const gap = 0.16 - 0.1 * k * Math.min(1, feet / 20);
    for (let u = -across + ((v * 37) % 1) * gap; u < across; u += gap) strokes.push([frame.at(u, v), frame.at(u + 0.01, v + 0.06)]);
  }
  ctxClip(hand, path, () => hand.line(strokes, 'fine'));
}

function drawSlope(hand: Hand, frame: WayFrame, seed: number, feet: number, end?: StairEnd): void {
  // Its lines are worked out once: a map is drawn again and again as it is panned and zoomed.
  const key = `${hand.scene.env.dungeon.model.seed}:${hand.scene.env.dungeon.index}:${seed}:${end ?? 'steps'}:${frame.bounds.minX},${frame.bounds.minY},${frame.bounds.maxX},${frame.bounds.maxY}`;
  const slope = boundedCached(SLOPES, key, 64, () => screeSlope(frame, seed, end, end === undefined ? neckFaces(hand, frame) : undefined));
  const t = slopeT(frame, slope);
  const area = slopeArea(slope);
  const bounds = pointsBounds(area);
  gradedSlope(hand, polyPath(area), bounds, frame, slope, t, feet);
  // The edges' bands first, so the stones lie over them.
  const edges: { run: Vec[]; low: number; closed: boolean; width: (p: Vec) => number }[] = [];
  if (slope.ring) edges.push({ run: slope.ring, low: insideOf(slope.ring), closed: true, width: p => band(feet * Math.max(0.12, t(p))) });
  for (const side of slope.sides) edges.push({ run: side.run, low: side.low, closed: false, width: p => (t(p) > 0.92 ? 0 : band(feet * (1 - t(p)))) });
  if (slope.head && end === undefined) edges.push({ run: slope.head.run, low: slope.head.low, closed: false, width: () => band(feet) });
  lowBands(hand, edges, true);
  const ink = inkOf(hand);
  hand.line(slope.contours, 'fine');
  fillWith(hand, polysPath(slope.wedges), withAlpha(ink, lookOf(hand) === 'crayon' ? 0.7 : 0.8));
  drawRubble(hand, slope.stones);
  for (const e of edges) {
    ticks(hand, e.run, e.low, p => e.width(p) * 0.7, { closed: e.closed, seed });
    edgeLine(hand, e.run, e.low, e.closed, seed);
    litLip(hand, e.run, e.low, e.closed);
  }
  // From below, the ceiling's edge the slope comes out from under: overhead, so dashed and never shaded.
  if (slope.head && end === 'lower') strokeWith(hand, dashes(slope.head.run, 0.12, 0.07, false), withAlpha(ink, lookOf(hand) === 'crayon' ? 0.45 : 0.85), lookOf(hand) === 'crayon' ? 0.03 : 0.017);
}

function ctxClip(hand: Hand, path: PathFn, draw: () => void): void {
  const { ctx } = hand.scene.env;
  ctx.save();
  ctx.beginPath();
  path(ctx);
  ctx.clip();
  draw();
  ctx.restore();
}

/** A slope's own seed, from where it lies, so one slope never moves when another changes. */
function seedOf(hand: Hand, frame: WayFrame): number {
  return slopeSeed(frame, hand.scene.env.dungeon.model.seed);
}

/** A steps door's slope: its cell and the next one down, the floor the slope spills onto. */
function stepsFrame(door: DungeonDoor, down: CellDir): WayFrame {
  const cells = doorCells(door);
  const b = pointsBounds([...cells, ...cells.map(c => ({ x: c.x + down.x, y: c.y + down.y }))]);
  return wayFrame({ x: b.minX, y: b.minY, w: b.maxX - b.minX + 1, h: b.maxY - b.minY + 1 }, down);
}

function slope(hand: Hand, frame: WayFrame, feet: number, end?: StairEnd): void {
  const { ctx } = hand.scene.env;
  ctx.save();
  ctx.beginPath();
  polysPath(hand.scene.floorRings)(ctx);
  ctx.clip();
  drawSlope(hand, frame, seedOf(hand, frame), feet, end);
  ctx.restore();
}

export function drawScree(hand: Hand): void {
  const { dungeon } = hand.scene.env;
  for (const door of dungeon.doors) {
    if (door.kind !== 'steps') continue;
    const down = door.descends ? door.dir : { x: -door.dir.x, y: -door.dir.y } as CellDir;
    slope(hand, stepsFrame(door, down), 10);
  }
  for (const stair of dungeon.floor.stairs) {
    if (stair.way === 'scree') slope(hand, wayFrame(stair, stair.down), 10 * Math.max(1, Math.abs(stair.to - dungeon.index)), stairEnd(stackOf(dungeon.model), dungeon.index, stair.to));
  }
}
