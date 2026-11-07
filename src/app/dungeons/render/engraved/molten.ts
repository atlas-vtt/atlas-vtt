import type { ArtScene } from '../art/artScene';
import { GLOW, moltenAt, moltenHeat, type Molten } from '../art/lavaField';
import { valueNoise } from '../art/noise';
import { clipFloors } from '../art/outline';
import { runsPath, type Field, type PathFn } from '../art/paths';
import { pointsBounds, type Vec } from '../geometry';
import { outsetRing } from '../terrain/moltenShape';
import { hatchFill } from './hatch';
import type { Pens } from './pens';

/** Where the melt is bright enough to show a flow line, and how far apart its lines run, in cells. */
const FLOW_MELT = 0.55;
const FLOW_SPACING = 0.26;
/** Bubbles per cell of acid's area, their radius in cells, and how far outside its shore its crust's rim runs. */
const BUBBLES = { perCell: 0.45, min: 0.035, max: 0.09 };
const CRUST_RIM = 0.08;

/**
 * Molten rock as a print shows it: its cooling crust cut dark along its banks, the melt of its core
 * left bright, and where it runs, the hatch laid along its flow with a few fine flow lines drawn in
 * the bright core. Acid shows a broken rim of crust outside its shore and bubbles in it.
 */
export function paintMolten(scene: ArtScene, pens: Pens, trace: PathFn, outlines: readonly Vec[][], depth: Field, kind: Molten, flow?: Vec): void {
  const { ctx, dungeon } = scene.env;
  const b = pointsBounds(outlines.flat());
  const heat = moltenHeat(outlines, depth, flow);
  const px = new Uint8ClampedArray(4);
  const melt = (x: number, y: number): number => {
    px[0] = px[1] = px[2] = 0;
    moltenAt(kind, x, y, depth(x, y), px, 0, heat);
    const glow = GLOW[kind];
    return Math.min(1, (px[0] / glow[0] + px[1] / glow[1]) / 2);
  };
  const along = flow ? Math.atan2(flow.y, flow.x) : pens.angle + Math.PI / 2;
  ctx.save();
  clipFloors(scene);
  ctx.beginPath();
  trace(ctx);
  ctx.fillStyle = pens.mono ? pens.floor : pens.water;
  ctx.fill();
  ctx.clip();
  hatchFill(ctx, pens.ink, {
    angle: along,
    spacing: pens.spacing * 0.7,
    bounds: b,
    step: pens.step,
    minWidth: pens.minWidth,
    width: (x, y) => (depth(x, y) > 0 ? pens.spacing * 0.7 * Math.max(0, 1 - melt(x, y) * 1.4) : 0),
  });
  if (flow) {
    const seed = dungeon.model.seed + 53;
    hatchFill(ctx, pens.ink, {
      angle: along,
      spacing: FLOW_SPACING,
      phase: FLOW_SPACING / 2,
      bounds: b,
      step: pens.step,
      minWidth: pens.minWidth * 0.5,
      wobble: (x, y) => (valueNoise(x * 1.3, y * 1.3, seed) - 0.5) * FLOW_SPACING * 0.6,
      // Broken into strokes, as melt shows its flow in streaks.
      width: (x, y) => (melt(x, y) > FLOW_MELT && valueNoise(x * 2.2, y * 2.2, seed + 1) > 0.45 ? pens.minWidth * 1.4 : 0),
    });
  }
  ctx.restore();
  ctx.save();
  clipFloors(scene);
  ctx.beginPath();
  trace(ctx);
  ctx.strokeStyle = pens.ink;
  ctx.lineWidth = 0.03;
  ctx.stroke();
  if (kind === 'acid') acidMarks(scene, pens, trace, outlines, depth);
  ctx.restore();
}

/** Acid's crust rim, a broken line just outside its shore, and its bubbles, small rings rising through it away from the shore. */
function acidMarks(scene: ArtScene, pens: Pens, trace: PathFn, outlines: readonly Vec[][], depth: Field): void {
  const { ctx } = scene.env;
  ctx.save();
  // Kept off the acid where the rim folds over a narrow bay.
  ctx.beginPath();
  ctx.rect(-1e5, -1e5, 2e5, 2e5);
  trace(ctx);
  ctx.clip('evenodd');
  ctx.beginPath();
  runsPath(outlines.map((ring) => outsetRing(ring, CRUST_RIM)), true)(ctx);
  ctx.setLineDash([0.16, 0.07, 0.05, 0.07]);
  ctx.lineWidth = 0.014;
  ctx.strokeStyle = pens.ink;
  ctx.lineJoin = 'round';
  ctx.stroke();
  ctx.restore();
  const b = pointsBounds(outlines.flat());
  const rng = scene.env.rng('acid');
  const count = Math.round((b.maxX - b.minX) * (b.maxY - b.minY) * BUBBLES.perCell);
  ctx.save();
  ctx.beginPath();
  for (let k = 0; k < count; k++) {
    const x = b.minX + rng() * (b.maxX - b.minX);
    const y = b.minY + rng() * (b.maxY - b.minY);
    const r = BUBBLES.min + rng() * (BUBBLES.max - BUBBLES.min);
    if (depth(x, y) < r * 1.6) continue;
    ctx.moveTo(x + r, y);
    ctx.arc(x, y, r, 0, Math.PI * 2);
  }
  ctx.lineWidth = 0.012;
  ctx.strokeStyle = pens.ink;
  ctx.stroke();
  ctx.restore();
}
