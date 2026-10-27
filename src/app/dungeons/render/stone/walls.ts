import { withAlpha } from '../palette';
import type { ArtScene } from '../art/artScene';
import { hash2 } from '../art/noise';
import { TO_LIGHT } from '../art/light';
import { clipOutsideMouths, grownRings, rockSide, traceRings, traceWallInk } from '../art/outline';
import { wallInkWidth } from '../wallInk';
import type { StoneColours } from './colours';
import { cellPattern } from './patterns';
import { grainTile, tileTexels } from './textures';

/**
 * Every room is lined with a course of dressed blocks: stone with its grain, joints across it at
 * irregular lengths, its edges lit where they face the light. Where wall meets floor runs one crisp
 * line of ink, the only ink of the architecture, so walls read at any size and under tokens.
 */

/** The wall's course, in cells. */
export const BAND = 0.15;

export function drawWallBand(scene: ArtScene, c: StoneColours): void {
  const { ctx, dungeon } = scene.env;
  const seed = dungeon.model.seed;
  const outer = grownRings(scene, BAND);
  ctx.save();
  clipOutsideMouths(scene, BAND);
  ctx.beginPath();
  traceRings(ctx, outer);
  traceRings(ctx, scene.floorRings);
  ctx.fillStyle = c.band;
  ctx.fill('evenodd');
  ctx.clip('evenodd');
  if (scene.raster) {
    ctx.fillStyle = cellPattern(ctx, grainTile(0.08, tileTexels(1.6)), 1.6);
    ctx.fill('evenodd');
  }
  joints(scene, c, seed);
  litEdges(scene, c, outer);
  ctx.restore();
  ctx.save();
  clipOutsideMouths(scene, BAND + 0.01);
  ctx.beginPath();
  traceRings(ctx, outer);
  ctx.strokeStyle = withAlpha(c.dark ? '#000000' : c.line, c.dark ? 0.55 : 0.4);
  ctx.lineWidth = 0.01;
  ctx.lineJoin = 'miter';
  ctx.stroke();
  ctx.restore();
}

/** Joints across the course at irregular lengths: dark, with a lit lip on the side towards the light. */
function joints(scene: ArtScene, c: StoneColours, seed: number): void {
  const { ctx } = scene.env;
  const cuts: number[] = [];
  for (const ring of scene.floorRings) {
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i]!;
      const b = ring[(i + 1) % ring.length]!;
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      if (len < 0.08) continue;
      const n = rockSide(scene, a, b);
      const t = { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
      let at = 0.1 + hash2(Math.round(a.x * 8), Math.round(a.y * 8), seed) * 0.3;
      while (at < len - 0.08) {
        cuts.push(a.x + t.x * at, a.y + t.y * at, n.x, n.y, t.x, t.y);
        at += 0.36 + hash2(Math.round(at * 40), i, seed + 1) * 0.32;
      }
    }
  }
  const stroke = (offset: number, colour: string, width: number): void => {
    ctx.beginPath();
    for (let k = 0; k < cuts.length; k += 6) {
      const [x, y, nx, ny, tx, ty] = cuts.slice(k, k + 6) as [number, number, number, number, number, number];
      ctx.moveTo(x + tx * offset, y + ty * offset);
      ctx.lineTo(x + tx * offset + nx * BAND * 1.2, y + ty * offset + ny * BAND * 1.2);
    }
    ctx.strokeStyle = colour;
    ctx.lineWidth = width;
    ctx.stroke();
  };
  stroke(0, withAlpha(c.dark ? '#000000' : c.line, 0.5), 0.01);
  stroke(0.01, withAlpha(c.light, c.dark ? 0.1 : 0.35), 0.007);
}

/** The course's two edges catch the light where they face it and fall dark where they do not. */
function litEdges(scene: ArtScene, c: StoneColours, outer: readonly (readonly { x: number; y: number }[])[]): void {
  const { ctx } = scene.env;
  ctx.lineCap = 'butt';
  for (const [rings, faceSign, inset] of [[scene.floorRings, -1, 0.014], [outer, 1, 0.012]] as const) {
    for (const ring of rings) {
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i]!;
        const b = ring[(i + 1) % ring.length]!;
        const toRock = rockSide(scene, a, b);
        const face = { x: toRock.x * faceSign, y: toRock.y * faceSign };
        const lit = face.x * TO_LIGHT.x + face.y * TO_LIGHT.y;
        if (Math.abs(lit) < 0.1) continue;
        // On the course: towards the rock from the floor's edge, towards the floor from the outer edge.
        const o = { x: toRock.x * inset * -faceSign, y: toRock.y * inset * -faceSign };
        ctx.beginPath();
        ctx.moveTo(a.x - o.x, a.y - o.y);
        ctx.lineTo(b.x - o.x, b.y - o.y);
        ctx.strokeStyle = lit > 0 ? withAlpha(c.light, (c.dark ? 0.16 : 0.5) * lit) : withAlpha('#000000', 0.28 * -lit);
        ctx.lineWidth = 0.02;
        ctx.stroke();
      }
    }
  }
}

/** The crisp line where wall meets floor: on the wall's side of the floor's edge, its width the scene's wall ink. */
export function drawWallEdge(scene: ArtScene, c: StoneColours): void {
  const { ctx, style } = scene.env;
  const ink = wallInkWidth(style);
  ctx.save();
  clipOutsideMouths(scene, ink + 0.02);
  ctx.beginPath();
  traceRings(ctx, grownRings(scene, ink + 0.02));
  traceRings(ctx, scene.floorRings);
  ctx.clip('evenodd');
  ctx.beginPath();
  traceWallInk(ctx, scene, ink);
  ctx.strokeStyle = c.line;
  ctx.stroke();
  ctx.restore();
}
