import type { DungeonDoor } from '../../../model';
import type { Hand } from '../../art/hand';
import { hash2 } from '../../art/noise';
import type { Vec } from '../../geometry';
import { band, edgeLine, litLip, lookOf, lowBand, ticks } from '../../vertical/marks';
import { drawAnchor, drawRope } from '../../vertical/rope';
import { drawRubble } from '../../vertical/rubble';
import { bowed, runLength, wobbled } from '../../vertical/runs';
import { cornerHatch, footRubble, paperLip, pressedEdge, wallAlong } from './climbMarks';
import { doorFrame } from './narrows';
import { clipped, clipToFloor, doorRng, doorsOfWay } from './wayDoors';

/**
 * A climb within a floor (a pitch or a chimney of ten or twenty feet in a passage), as surveys and
 * Dyson Logos draw a step in the floor: one bowed edge across the passage from wall to wall, found
 * where the walls stand rather than at the door cell's sides, so it never stops short in the open
 * and reads as a stray line, and meeting each wall at a slant, never square to the grid. Its low
 * side carries a band as wide as the climb is high, cross-hatched where it meets the walls, fanned
 * ticks and the rubble that broke off, crowded at the foot and spreading past it; its high side a
 * lit lip, and on a pitch (never a chimney or a squeeze, climbed by bracing) a ring on a boulder
 * the rope is tied to, going over the edge into the shadow. Crayon presses it in: a heavy broken
 * edge, two layers of wax heavier at the foot, fewer fatter ticks and a strip of bare paper for the
 * lip. It is drawn within the floor, so the walls' ink where the scene puts its walls stays as it is.
 */

/** How far back from the edge the rope's ring is bolted, in cells: on the rock of the high side, past the door's cell. */
const ANCHOR_BACK = 0.55;
/** How far past each wall's face the edge runs before the floor cuts it, in cells. */
const INTO_WALL = 0.08;
/** The slant off square to the passage, in radians: 12° to 25°, so the edge meets each wall at 65° to 78°. */
const LEAST_SLANT = 0.21;
const MORE_SLANT = 0.23;
/** Crayon's pressed edge, in cells. */
const PRESSED = 0.05;

function seedOf(hand: Hand, door: DungeonDoor): number {
  return Math.floor(hash2(door.x, door.y, hand.scene.env.dungeon.model.seed + 17) * 0x7fffffff);
}

export function drawClimbs(hand: Hand): void {
  const crayon = lookOf(hand) === 'crayon';
  for (const door of doorsOfWay(hand, 'climb')) {
    const { at } = doorFrame(door);
    const rng = doorRng(hand, door, 'climb');
    const seed = seedOf(hand, door);
    const feet = door.drop?.depth ?? 10;
    // A pitch is roped; a chimney or a squeeze is climbed by bracing against its walls.
    const roped = (door.drop?.kind ?? 'shaft') === 'shaft';
    const width = band(feet);
    // The frame runs from `from` towards `to`: the edge's left (+v) is the `to` side, low where the way descends.
    const low = door.descends ? 1 : -1;
    const o = at(0, 0);
    const unit = (p: Vec): Vec => ({ x: p.x - o.x, y: p.y - o.y });
    const high = unit(at(0, -low));
    const down = { x: -high.x, y: -high.y };
    // Laid a little towards the high side and turned off square, then found wall to wall along that line.
    const middle = at(0, -low * 0.2);
    const slant = (LEAST_SLANT + MORE_SLANT * rng()) * (rng() < 0.5 ? -1 : 1);
    const u = unit(at(1, 0));
    const across = { x: u.x * Math.cos(slant) - u.y * Math.sin(slant), y: u.x * Math.sin(slant) + u.y * Math.cos(slant) };
    const reach = (side: number): number => (wallAlong(hand, middle, { x: across.x * side, y: across.y * side }) || 0.5) + INTO_WALL;
    const [left, right] = [reach(-1), reach(1)];
    const a = { x: middle.x - across.x * left, y: middle.y - across.y * left };
    const b = { x: middle.x + across.x * right, y: middle.y + across.y * right };
    // Which side of the run, travelled from `a` to `b`, is low: +1 its left (`runs.ts`).
    const lowSide = across.y * down.x - across.x * down.y > 0 ? 1 : -1;
    // Bowed towards the low side, 0.2 to 0.4 cells on a passage's width, less on a short span so it never turns back on itself.
    const run = wobbled(bowed(a, b, lowSide * Math.min(0.2 + 0.2 * rng(), (left + right) * 0.22)), seed, 0.035);
    const length = runLength(run);
    const walls: [number, number] = [INTO_WALL, length - INTO_WALL];
    const lip = run[Math.round((run.length - 1) * (0.4 + 0.2 * rng()))]!;
    const side = unit(at(-0.18, 0));
    const anchor = { x: lip.x + high.x * ANCHOR_BACK + side.x, y: lip.y + high.y * ANCHOR_BACK + side.y };
    const foot = (d: number): Vec => ({ x: lip.x + down.x * d, y: lip.y + down.y * d });
    clipped(hand, clipToFloor, () => {
      lowBand(hand, run, lowSide, width, { corners: true, strength: crayon ? 1 : 1.5, ...(crayon && { covers: [0.35, 0.6] as const }) });
      if (lookOf(hand) !== 'engraving') cornerHatch(hand, run, lowSide, width, walls);
      drawRubble(hand, footRubble(hand, rng, run, down, width));
      ticks(hand, run, lowSide, width, { fan: 0.14, seed, crayon: { spacing: 0.26, base: 0.06 }, ...(roped && { keepClear: lip }) });
      if (roped) drawRope(hand, [anchor, lip, foot(width * 0.85)]);
      if (crayon) pressedEdge(hand, run, seed, PRESSED);
      else edgeLine(hand, run, lowSide, false, seed);
      litLip(hand, run, lowSide);
      paperLip(hand, run, lowSide);
      if (roped) drawAnchor(hand, anchor, seed + 1);
    });
  }
}
