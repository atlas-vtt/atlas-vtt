import type { Hand } from '../../art/hand';
import { SHADOW_DIR, TO_LIGHT } from '../../art/light';
import { polyPath, polysPath, type PathFn } from '../../art/paths';
import { pointsBounds, type Vec } from '../../geometry';
import { withAlpha } from '../../palette';
import type { WayFrame } from './narrows';
import { shiftedBack, type ShaftMouth } from './shaftMouth';
import { stoneOf } from './wayColours';

/**
 * Light falling down an aven: daylight, or the glow of the floor above, comes down the chimney at
 * the light's slant, so it reaches the floor as a pool moved down and to the right of the opening
 * overhead, and the floor round it dims outward under the ceiling. Inside the opening, the chimney's
 * wall below its far lip is lit and its near lip throws the overhang's shadow. Stone lays all of it
 * as gradients (raster pictures; an SVG keeps the pool as a plain tint); Engraved, with no light to
 * lay, hatches only the overhang's shadow, and leaves the rest to its dashed contours.
 */

/** How far the light's slant moves the pool from the opening, in cells. */
const FALL = 0.2;
/** How far the overhang's shadow and the lit wall reach into the opening, in cells. */
const OVERHANG = 0.13;
const LIT_WALL = 0.08;

export interface Pool {
  ring: Vec[];
  centre: Vec;
}

/** Where the light lands: the opening moved along the light's fall. */
export function poolOf(mouth: ShaftMouth): Pool {
  const move = (p: Vec): Vec => ({ x: p.x + SHADOW_DIR.x * FALL, y: p.y + SHADOW_DIR.y * FALL });
  return { ring: mouth.rings[0]!.map(move), centre: move(mouth.centre) };
}

function fill(hand: Hand, path: PathFn, style: string | CanvasGradient): void {
  const { ctx } = hand.scene.env;
  ctx.beginPath();
  path(ctx);
  ctx.fillStyle = style;
  ctx.fill();
}

/** The two crescents inside the opening: the overhang's shadow on the side towards the light, the lit wall on the other. */
function crescent(ring: readonly Vec[], dir: Vec, reach: number): PathFn {
  return polysPath([ring, shiftedBack(ring, dir, reach)]);
}

export function layAvenLight(hand: Hand, frame: WayFrame, mouth: ShaftMouth): void {
  const rim = mouth.rings[0]!;
  const { ctx } = hand.scene.env;
  const c = stoneOf(hand);
  if (!c) {
    ctx.save();
    ctx.beginPath();
    polyPath(rim)(ctx);
    ctx.clip();
    hand.tone(() => 0.4, pointsBounds(rim), crescent(rim, SHADOW_DIR, OVERHANG), 'shade');
    ctx.restore();
    return;
  }
  const pool = poolOf(mouth);
  if (!hand.scene.raster) {
    fill(hand, polyPath(pool.ring), withAlpha(c.light, c.dark ? 0.12 : 0.32));
    return;
  }
  const { down } = frame;
  const rx = down.x ? mouth.half.v : mouth.half.u;
  const ry = down.x ? mouth.half.u : mouth.half.v;
  const bright = c.dark ? 0.32 : 0.62;
  // One gradient round the pool: bright where the light lands, falling off past its edge, then the
  // floor under the ceiling dimming outward before it fades into the cave's own dark.
  const reach = 2;
  ctx.save();
  ctx.translate(pool.centre.x, pool.centre.y);
  ctx.scale(rx, ry);
  const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, reach);
  for (const [at, colour] of [
    [0, withAlpha(c.light, bright)], [0.6, withAlpha(c.light, bright * 0.7)], [0.95, withAlpha(c.light, bright * 0.25)],
    [1.15, withAlpha(c.light, 0)], [1.3, withAlpha('#000000', 0.06)], [1.6, withAlpha('#000000', 0.08)], [reach, withAlpha('#000000', 0)],
  ] as const) glow.addColorStop(at / reach, colour);
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.ellipse(0, 0, reach, reach, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.beginPath();
  polyPath(rim)(ctx);
  ctx.clip();
  fill(hand, crescent(rim, SHADOW_DIR, OVERHANG), withAlpha('#000000', 0.22));
  fill(hand, crescent(rim, TO_LIGHT, LIT_WALL), withAlpha(c.light, c.dark ? 0.3 : 0.55));
  ctx.restore();
}
