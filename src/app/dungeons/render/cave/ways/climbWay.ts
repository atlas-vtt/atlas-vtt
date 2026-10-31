import type { DungeonDoor } from '../../../model';
import type { Hand } from '../../art/hand';
import { hash2 } from '../../art/noise';
import type { Vec } from '../../geometry';
import { clearOfCaveWall } from '../../terrain/pieces';
import { band, edgeLine, litLip, lowBand, ticks } from '../../vertical/marks';
import { drawAnchor, drawRope } from '../../vertical/rope';
import { drawRubble, rubbleStone } from '../../vertical/rubble';
import { bowed, wobbled } from '../../vertical/runs';
import { doorFrame } from './narrows';
import { clipped, clipToFloor, doorRng, doorsOfWay } from './wayDoors';

/**
 * A climb within a floor (a pitch or a chimney of ten or twenty feet in a passage), as surveys and
 * Dyson Logos draw a step in the floor: one bowed edge across the passage from wall to wall,
 * meeting each wall at a slant, never square to the grid. Its low side carries a band as wide as
 * the climb is high, fanned ticks and the rubble that broke off, crowded at the foot and near the
 * walls; its high side a lit lip, and on a pitch (never a chimney or a squeeze, climbed by bracing)
 * a ring on a boulder the rope is tied to, going over the edge into the shadow. It is drawn within
 * the floor, so the walls' ink where the scene puts its walls stays as it is.
 */

/** How far back from the edge the rope's ring is bolted, in cells: on the rock of the high side, past the door's cell. */
const ANCHOR_BACK = 0.55;

/** How far past the door cell's sides the edge is laid before the floor cuts it, in cells: always into the walls. */
const PAST_WALLS = 0.6;

function seedOf(hand: Hand, door: DungeonDoor): number {
  return Math.floor(hash2(door.x, door.y, hand.scene.env.dungeon.model.seed + 17) * 0x7fffffff);
}

export function drawClimbs(hand: Hand): void {
  for (const door of doorsOfWay(hand, 'climb')) {
    const frame = doorFrame(door);
    const { at, across } = frame;
    const rng = doorRng(hand, door, 'climb');
    const seed = seedOf(hand, door);
    const feet = door.drop?.depth ?? 10;
    // A pitch is roped; a chimney or a squeeze is climbed by bracing against its walls.
    const roped = (door.drop?.kind ?? 'shaft') === 'shaft';
    const width = band(feet);
    // The frame runs from `from` towards `to`: the edge's left (+v) is the `to` side, low where the way descends.
    const low = door.descends ? 1 : -1;
    const half = across / 2 + PAST_WALLS;
    const tilt = (0.12 + 0.12 * rng()) * (rng() < 0.5 ? -1 : 1);
    // Laid a little towards the high side and bowed towards the low one, so the edge crosses the cell's middle.
    const run = wobbled(bowed(at(-half, -tilt - low * 0.2), at(half, tilt - low * 0.2), low * (0.12 + 0.1 * rng())), seed, 0.035);
    const lip = run[Math.round(run.length * (0.4 + 0.2 * rng()))]!;
    const high = { x: (at(0, -low).x - at(0, 0).x), y: (at(0, -low).y - at(0, 0).y) };
    const anchor = { x: lip.x + high.x * ANCHOR_BACK + (at(-0.18, 0).x - at(0, 0).x), y: lip.y + high.y * ANCHOR_BACK + (at(-0.18, 0).y - at(0, 0).y) };
    const foot = (d: number): Vec => ({ x: lip.x - high.x * d, y: lip.y - high.y * d });
    clipped(hand, clipToFloor, () => {
      lowBand(hand, run, low, width, { corners: true });
      drawRubble(hand, footRubble(hand, rng, run, high, width, roped ? 3 : 2));
      ticks(hand, run, low, width, { fan: 0.14, seed, ...(roped && { keepClear: lip }) });
      if (roped) drawRope(hand, [anchor, lip, foot(width * 0.85)]);
      edgeLine(hand, run, low, false, seed);
      litLip(hand, run, low);
      if (roped) drawAnchor(hand, anchor, seed + 1);
    });
  }
}

/** How far past the edge rubble lies at most, in cells: the climb keeps to its cell and half a cell beyond. */
const RUBBLE_REACH = 0.42;

/**
 * Pieces at the foot (`least` and up to five more; fewer where a chimney is braced up than where a
 * pitch broke): in the band and a little past it, more near the walls than in the middle.
 */
function footRubble(hand: Hand, rng: () => number, run: readonly Vec[], high: Vec, width: number, least: number): ReturnType<typeof rubbleStone>[] {
  const stones: ReturnType<typeof rubbleStone>[] = [];
  const count = least + Math.floor(rng() * (least + 3));
  for (let i = 0; i < count * 2 && stones.length < count; i++) {
    // Towards the ends of the edge, where it meets the walls, more often than its middle.
    const s = rng();
    const k = Math.round((s < 0.5 ? s * s * 2 : 1 - (1 - s) * (1 - s) * 2) * (run.length - 1));
    const p = run[k]!;
    const r = 0.025 + 0.045 * rng();
    const d = Math.min(RUBBLE_REACH - r, width * (0.25 + 0.6 * rng()) + (rng() < 0.4 ? 0.1 + 0.2 * rng() : 0));
    const c = { x: p.x - high.x * d, y: p.y - high.y * d };
    if (clearOfCaveWall(hand.scene.env, c, r)) stones.push(rubbleStone(rng, c, r));
  }
  return stones;
}
