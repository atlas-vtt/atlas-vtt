import type { ArtScene } from '../art/artScene';
import { viewBounds } from '../art/artScene';
import { clipFloors } from '../art/outline';
import { activeCells, fieldOf, sampleField } from '../art/raster';
import { hatchFill } from './hatch';
import type { Pens } from './pens';

/**
 * Cast shadows and the dark at every foot: the rock's lines carried on across the floor, as wide as
 * the shadow is deep but never wider than a fine line, so the floor stays light under tokens.
 */
export function drawShade(scene: ArtScene, pens: Pens): void {
  if (!scene.env.view.shadow) return;
  const { ctx, style } = scene.env;
  const strength = style.shadow.strength;
  const depth = fieldOf(scene.grid, (x, y) => (scene.sdfAt(x, y) > 0.05 ? 0 : Math.min(1, scene.shadowAt(x, y) * 0.9 + scene.occlusionAt(x, y) * 0.5) ** 1.4));
  ctx.save();
  clipFloors(scene);
  hatchFill(ctx, pens.shade, {
    angle: pens.angle,
    spacing: pens.spacing,
    bounds: viewBounds(scene.frame),
    // A shadow's width changes slowly along a line: a coarse step is enough.
    step: Math.max(pens.step, 0.05),
    minWidth: pens.minWidth,
    active: activeCells(scene.grid, depth),
    width: (x, y) => pens.spacing * 0.32 * strength * sampleField(scene.grid, depth, x, y),
  });
  ctx.restore();
}
