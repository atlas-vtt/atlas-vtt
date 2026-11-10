import type { Hand } from '../../art/hand';
import { polyPath, smoothstep } from '../../art/paths';
import { pointsBounds, type Vec } from '../../geometry';
import { chiselled } from '../../terrain/stones';
import { withAlpha } from '../../palette';
import { pinchFrame } from './pinch';
import { stoneOf } from './wayColours';
import { clipped, clipToFloor, doorRng, doorsOfWay } from './wayDoors';

/** How near the middle of the way the lip comes, in cells: the ledge left is the rest of the cell. */
const LIP = 0.06;
/** How far along the way the drop runs either side of the cell's middle. */
const REACH = 0.46;

/**
 * The drop's depth, darker from its lip at `from` to the wall's side at `to`. Stone lays it as one
 * gradient (a plain tint in a vector picture), where a toned field over the cell cost more than the
 * rest of the way; the other hands lay `field` as their tone, which is how they hatch.
 */
function layDepth(hand: Hand, drop: readonly Vec[], from: Vec, to: Vec, field: (x: number, y: number) => number): void {
  const c = stoneOf(hand);
  if (!c) {
    hand.tone(field, pointsBounds(drop), polyPath(drop), 'depth');
    return;
  }
  const { ctx } = hand.scene.env;
  ctx.beginPath();
  polyPath(drop)(ctx);
  if (hand.scene.raster) {
    const gradient = ctx.createLinearGradient(from.x, from.y, to.x, to.y);
    gradient.addColorStop(0, withAlpha('#000000', 0.3));
    gradient.addColorStop(1, withAlpha('#000000', 0.9));
    ctx.fillStyle = gradient;
  } else ctx.fillStyle = withAlpha('#000000', 0.55);
  ctx.fill();
}

/**
 * A traverse (a way along a ledge over a drop): the narrows as a walk has them, and on one wall's
 * side the floor breaking away into a drop, drawn as `drops.ts` draws one, small: rock darkening
 * down its face, broken ledge lines, the lip falling away, and ticks pointing down where the look
 * has no tone to say it. The ledge left along the other wall is the way across; the chasm the
 * terrain puts in the passage behind carries the hazard.
 */
export function drawTraverses(hand: Hand): void {
  const engraved = hand.scene.env.style.direction !== 'stone';
  for (const door of doorsOfWay(hand, 'traverse')) {
    const rng = doorRng(hand, door, 'traverse');
    const side = rng() < 0.5 ? -1 : 1;
    const frame = pinchFrame(door);
    const p = (u: number, v: number): Vec => frame.at(side * u, v);
    const lipAt = (v: number): number => LIP + 0.42 * (Math.abs(v) / REACH) ** 2.2;
    const lip = Array.from({ length: 9 }, (_, k) => {
      const v = -REACH + (2 * REACH * k) / 8;
      return p(lipAt(v), v);
    });
    const drop = chiselled([...lip, p(0.62, REACH), p(0.62, -REACH)], Math.floor(rng() * 1e6), 0.02);
    const path = polyPath(drop);
    // Darker the farther down the face, across from the lip into the wall's side.
    const across = (x: number, y: number): number => ((x - door.x - 0.5) * -door.dir.y + (y - door.y - 0.5) * door.dir.x) * side;
    const ledges = [0.16, 0.28].map(u => Array.from({ length: 5 }, (_, k) => {
      const v = -0.3 + 0.15 * k;
      return p(lipAt(v) + u - LIP, v);
    }).slice(0, 4 + Math.floor(rng() * 2)));
    const ticks = engraved ? [-0.2, 0, 0.2].map(v => [p(lipAt(v), v), p(lipAt(v) + 0.09, v)]) : [];
    clipped(hand, clipToFloor, () => {
      hand.surface(path, 'rock');
      layDepth(hand, drop, frame.at(side * LIP, 0), frame.at(side * 0.5, 0), (x, y) => 0.3 + 0.6 * smoothstep(LIP, 0.5, across(x, y)));
      hand.line([...ledges, ...ticks], 'fine');
      hand.edges(drop, false);
    });
  }
}
