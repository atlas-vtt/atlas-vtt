import type { Hand } from '../art/hand';
import { polyPath } from '../art/paths';
import type { Vec } from '../geometry';
import { withAlpha } from '../palette';
import { stoneOutline } from '../terrain/stones';
import { rngFrom } from '../../rng';
import { inkOf, strokeWith } from './marks';

/**
 * A rope rigged down a drop, as Dyson Logos draws one: a ring bolted to the rock on the high side,
 * back from the edge, and a dotted line from it over the lip into the shadow below, where it is
 * lost: the floor above never shows it reaching the floor below.
 */

/** A small ring and its bolt on a boulder at `at`, which the rope is tied to. */
export function drawAnchor(hand: Hand, at: Vec, seed: number): void {
  const rng = rngFrom(seed);
  const boulder = stoneOutline(rng, { x: at.x + 0.05, y: at.y - 0.07 }, 0.1);
  hand.fill(polyPath(boulder), 'rock');
  hand.line([boulder], 'outline', true);
  const ring = Array.from({ length: 12 }, (_, k) => ({ x: at.x + Math.cos(k * Math.PI / 6) * 0.04, y: at.y + Math.sin(k * Math.PI / 6) * 0.04 }));
  strokeWith(hand, [ring], hand.paint('metal').fill, 0.03, true);
  strokeWith(hand, [ring], inkOf(hand), hand.weight('outline'), true);
}

/** The rope as dots every 0.05 cells along `run`, from the anchor to where it is lost in the shadow. */
export function drawRope(hand: Hand, run: readonly Vec[]): void {
  // Dots as a dashed line of no length with round ends: one stroke, however long the rope.
  const { ctx } = hand.scene.env;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(run[0]!.x, run[0]!.y);
  for (const p of run.slice(1)) ctx.lineTo(p.x, p.y);
  ctx.setLineDash([0, 0.05]);
  ctx.lineDashOffset = -0.03;
  ctx.lineCap = 'round';
  ctx.lineWidth = 0.027;
  ctx.strokeStyle = withAlpha(inkOf(hand), 0.92);
  ctx.stroke();
  ctx.restore();
}
