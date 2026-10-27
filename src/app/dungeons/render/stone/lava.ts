import type { Vec } from '../geometry';
import { parseHex, withAlpha } from '../palette';
import type { ArtScene } from '../art/artScene';
import { GLOW, moltenAt, type Molten } from '../art/lavaField';
import { lavaDuotone } from '../art/lavaPalette';
import { clipFloors } from '../art/outline';
import type { PathFn } from '../art/paths';
import { depthField } from '../art/pools';
import { blurField, cellOf, drawField, drawGridCanvas, fieldOf, gridOver, pixelCanvas } from '../art/raster';
import { pointsBounds } from '../geometry';
import type { StoneColours } from './colours';
import { drawAcidDetail } from './acid';

/**
 * Molten rock or acid within `trace`: its surface from shore to middle, its glow spilling onto the
 * floor round it, its shore inked; acid bubbles and stains the floor (`drawAcidDetail`).
 */
export function drawLava(scene: ArtScene, c: StoneColours, outlines: readonly Vec[][], trace: PathFn, kind: Molten = 'lava'): void {
  const { ctx } = scene.env;
  const points = outlines.flat();
  if (!points.length) return;
  const depth = depthField(scene, trace, points);
  if (scene.raster) {
    const b = pointsBounds(points);
    const res = Math.min(40, Math.max(8, scene.frame.pxPerCell / 5));
    const grid = gridOver(b.minX - 0.9, b.minY - 0.9, b.maxX + 0.9, b.maxY + 0.9, res);
    const monoLava = kind === 'lava' && c.mono;
    const duotone = lavaDuotone(c.line, c.floor);
    const cold = parseHex(duotone.deep);
    const hot = parseHex(duotone.glint);
    const molten = pixelCanvas(grid, (k, out, o) => {
      const p = cellOf(grid, k % grid.w, Math.floor(k / grid.w));
      moltenAt(kind, p.x, p.y, depth(p.x, p.y), out, o);
      if (monoLava) {
        const heat = Math.max(0, Math.min(1, (out[o]! - 112) / 128));
        for (let channel = 0; channel < 3; channel++) out[o + channel] = cold[channel]! + (hot[channel]! - cold[channel]!) * (0.18 + heat * 0.68);
      }
    });
    // The glow on the floor round it, fading with distance from the shore.
    const inside = fieldOf(grid, (x, y) => (depth(x, y) > 0 ? 1 : 0));
    const softGlow = blurField(grid, inside, grid.res * 0.22, 3).map((v, k) => (inside[k]! > 0 ? 0 : Math.min(1, v * 1.6) * (c.dark ? 0.5 : 0.3)));
    ctx.save();
    clipFloors(scene);
    ctx.globalCompositeOperation = c.dark ? 'screen' : 'multiply';
    drawField(ctx, grid, monoLava ? hot : GLOW[kind], softGlow);
    ctx.restore();
    ctx.save();
    clipFloors(scene);
    ctx.beginPath();
    trace(ctx);
    ctx.clip();
    drawGridCanvas(ctx, grid, molten);
    ctx.restore();
  } else {
    ctx.save();
    clipFloors(scene);
    ctx.beginPath();
    trace(ctx);
    ctx.fillStyle = kind === 'lava' ? (c.mono ? c.stone : '#c8582e') : '#93a84a';
    ctx.fill();
    ctx.restore();
  }
  if (kind === 'acid' && scene.raster) drawAcidDetail(scene, c, outlines, trace, depth);
  ctx.save();
  clipFloors(scene);
  ctx.beginPath();
  trace(ctx);
  ctx.strokeStyle = withAlpha(c.dark ? '#000000' : c.line, 0.8);
  ctx.lineWidth = 0.016;
  ctx.stroke();
  ctx.restore();
}
