import type { DungeonStyle } from '../../style';
import type { ArtScene } from '../art/artScene';
import { clipOutsideMouths, grownRings, traceRings, traceWallInk } from '../art/outline';
import { wallInkWidth } from '../wallInk';
import type { Pens } from './pens';

/** The wall as cut: a heavy line outside the floor's edge, the scene's walls on its middle, and a fine line beside it. */
export const CUT = {
  width: (style: Pick<DungeonStyle, 'strokes'>): number => wallInkWidth(style),
  gap: 0.03,
  thin: 0.014,
};

/** `outerLine`: the fine line beyond the cut; a house draws its outer walls' outer face itself (`house/houseWalls.ts`). */
export function drawWalls(scene: ArtScene, pens: Pens, outerLine = true): void {
  const { ctx, style } = scene.env;
  const width = CUT.width(style);
  ctx.save();
  clipOutsideMouths(scene, width + CUT.gap + CUT.thin);
  ctx.strokeStyle = pens.ink;
  ctx.lineJoin = 'miter';
  if (outerLine) {
    ctx.beginPath();
    traceRings(ctx, grownRings(scene, width + CUT.gap + CUT.thin / 2));
    ctx.lineWidth = CUT.thin;
    ctx.stroke();
  }
  ctx.beginPath();
  traceRings(ctx, grownRings(scene, width + 0.02));
  traceRings(ctx, scene.floorRings);
  ctx.clip('evenodd');
  ctx.beginPath();
  traceWallInk(ctx, scene, width);
  ctx.stroke();
  ctx.restore();
}
