import type { Vec } from '../geometry';
import { pointsBounds } from '../geometry';
import type { ArtScene } from '../art/artScene';
import { GLOW, moltenAt, type Molten } from '../art/lavaField';
import { valueNoise } from '../art/noise';
import { clipFloors } from '../art/outline';
import type { Field, PathFn } from '../art/paths';
import { clipOutBuiltWater, deepnessField, depthField, poolOutlines, poolShores, poolsPath } from '../art/pools';
import { insetRuns } from '../shore';
import { hatchFill } from './hatch';
import type { Pens } from './pens';

/**
 * Water in burin lines: ruled level, broken by glints; shallow water is lined fuller at its shore,
 * deep water darkens towards its middle until the lines all but close, with a sounding's contours
 * stepping down to its depth.
 */
export function drawPools(scene: ArtScene, pens: Pens): void {
  const corners = poolOutlines(scene);
  if (!corners.length) return;
  const trace = poolsPath(corners);
  const outlines = poolShores(corners);
  const { ctx } = scene.env;
  ctx.save();
  clipOutBuiltWater(scene, ctx);
  paintWater(scene, pens, trace, outlines, depthField(scene, trace, outlines.flat()), false, deepnessField(scene));
  ctx.restore();
}

/** `deepness` (0..1) marks the deep part of a body that is shallow elsewhere: its lines thicken there as deep water's do, without a contour between. */
export function paintWater(scene: ArtScene, pens: Pens, trace: PathFn, outlines: readonly Vec[][], depth: Field, deep: boolean, deepness: Field | null = null): void {
  const { ctx, dungeon } = scene.env;
  const seed = dungeon.model.seed;
  const spacing = pens.spacing * 0.85;
  const b = pointsBounds(outlines.flat());
  ctx.save();
  clipFloors(scene);
  ctx.beginPath();
  trace(ctx);
  ctx.fillStyle = pens.water;
  ctx.fill();
  ctx.clip();
  hatchFill(ctx, pens.ink, {
    angle: 0,
    spacing,
    bounds: b,
    step: pens.step,
    minWidth: pens.minWidth,
    wobble: (x, y) => (valueNoise(x * 0.9, y * 3, seed + 21) - 0.5) * spacing * 0.5,
    width: (x, y) => {
      const d = depth(x, y);
      if (d <= 0) return 0;
      // Here and there a glint breaks a line, never so often that the water turns to a pattern.
      const glint = valueNoise(x * 0.9, y * 6, seed + 22);
      const open = glint > 0.8 ? Math.max(0, 1 - (glint - 0.8) * 12) : 1;
      const shallow = deep ? 0.3 + 0.12 * Math.min(1, d / 0.8) : 0.1 + 0.2 * Math.exp(-d / 0.14);
      const dn = deepness ? deepness(x, y) : 0;
      const body = dn > 0 ? shallow + (Math.max(shallow, 0.3 + 0.12 * Math.min(1, d / 0.8)) - shallow) * dn : shallow;
      return spacing * body * open;
    },
  });
  ctx.restore();
  ctx.save();
  clipFloors(scene);
  ctx.beginPath();
  trace(ctx);
  ctx.strokeStyle = pens.ink;
  ctx.lineJoin = 'round';
  ctx.lineWidth = deep ? 0.03 : 0.022;
  ctx.stroke();
  const contours = deep ? ([[0.06, 0.009], [0.16, 0.011], [0.3, 0.013]] as const) : ([[0.06, 0.009]] as const);
  for (const [inset, width] of contours) {
    ctx.beginPath();
    for (const outline of outlines) {
      for (const run of insetRuns(outline, inset)) {
        ctx.moveTo(run[0]!.x, run[0]!.y);
        for (const p of run.slice(1)) ctx.lineTo(p.x, p.y);
      }
    }
    ctx.lineWidth = width;
    ctx.stroke();
  }
  ctx.restore();
}

/** Molten rock as a print shows it: its cooling crust cut dark, the melt in the seams left bright, its glow a fine hatch on the floor round it. */
export function paintMolten(scene: ArtScene, pens: Pens, trace: PathFn, outlines: readonly Vec[][], depth: Field, kind: Molten): void {
  const { ctx } = scene.env;
  const b = pointsBounds(outlines.flat());
  const px = new Uint8ClampedArray(4);
  const melt = (x: number, y: number): number => {
    px[0] = px[1] = px[2] = 0;
    moltenAt(kind, x, y, depth(x, y), px, 0);
    const glow = GLOW[kind];
    return Math.min(1, (px[0] / glow[0] + px[1] / glow[1]) / 2);
  };
  ctx.save();
  clipFloors(scene);
  ctx.beginPath();
  trace(ctx);
  ctx.fillStyle = pens.mono ? pens.floor : pens.water;
  ctx.fill();
  ctx.clip();
  hatchFill(ctx, pens.ink, {
    angle: pens.angle + Math.PI / 2,
    spacing: pens.spacing * 0.7,
    bounds: b,
    step: pens.step,
    minWidth: pens.minWidth,
    width: (x, y) => (depth(x, y) > 0 ? pens.spacing * 0.7 * Math.max(0, 1 - melt(x, y) * 1.4) : 0),
  });
  ctx.restore();
  ctx.save();
  clipFloors(scene);
  ctx.beginPath();
  trace(ctx);
  ctx.strokeStyle = pens.ink;
  ctx.lineWidth = 0.03;
  ctx.stroke();
  ctx.restore();
}
