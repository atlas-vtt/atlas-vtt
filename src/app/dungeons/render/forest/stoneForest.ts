import type { ArtScene } from '../art/artScene';
import { noiseSampler } from '../art/noise';
import { smoothstep } from '../art/paths';
import { traceShape } from '../grounds/crowns';
import { scatter, withClip } from '../grounds/paint';
import { stoneGroundsPaint } from '../grounds/stonePaint';
import { mapLayout } from '../layoutSize';
import { mixColours } from '../palette';
import { stoneColours, type StoneColours } from '../stone/colours';
import { stoneHand } from '../stone/hand';
import { paintWater } from '../stone/water';
import { drawVellum } from '../vellum';
import { forestLookOf } from '../../forestLooks';
import type { ForestLook } from '../../style';
import { drawForest, massShare } from './drawForest';
import { colourIn, strokeLimbs } from './forestPaint';

/** How strongly the woods' vellum shows its grain. */
const WOODS_GRAIN = 2;
/** How strongly roads and trails show their worn ground at most. */
const PATH_STRENGTH = 0.9;

/**
 * Stone & shadow's forest in its look's mood (`ForestLook`): the woods the look's paper as vellum in
 * the woods' colour, the clearings its ground with grass in patches and blades, each crown of the
 * mass from mid to deep the deeper it stands, outlined in a darker shade of itself, lit towards the
 * light, bare trees' limbs over them, roads worn in, water in its own colour. Monochrome keeps to
 * the look's two pigments.
 */
export function paintStoneForest(scene: ArtScene): void {
  const { env } = scene;
  const c = stoneColours(env.palette, env.view.monochrome);
  const hand = stoneHand(scene, c);
  const { ctx, dungeon } = env;
  const look = env.view.monochrome ? monochrome(c) : forestLookOf(env.style);
  const { lit, mid, deep } = look.canopy;
  const seed = dungeon.model.seed;
  const grounds = stoneGroundsPaint(hand, c);
  drawForest(scene, {
    hand,
    ground: {
      ...grounds,
      lawn: (path, cells) => withClip(ctx, path, () => {
        ctx.fillStyle = look.ground;
        ctx.fill();
        // Grass in patches over the ground, and a nap of blades where it grows.
        const patches = noiseSampler(seed + 71, 7, 2, 2);
        colourIn(scene, path, look.grass, (x, y) => 0.85 * smoothstep(0.4, 0.62, patches(x, y)));
        blades(ctx, scatter(cells, 14, seed + 3), look);
      }),
    },
    colours: { water: look.water, cloth: c.cloth },
    woods: () => {
      const layout = mapLayout(dungeon.model, env.pxPerCell, env.view);
      ctx.save();
      ctx.translate(layout.originCell.x, layout.originCell.y);
      ctx.scale(1 / env.pxPerCell, 1 / env.pxPerCell);
      drawVellum(ctx, look.woods, layout, seed, !scene.raster, 1, true, WOODS_GRAIN);
      ctx.restore();
    },
    trail: (path, fade) => colourIn(scene, path, look.path, (x, y) => PATH_STRENGTH * fade({ x, y })),
    clump: ({ clump, depth }) => {
      const t = massShare(depth);
      const body = mixColours(mid, deep, t ** 0.7);
      // Pointed leaves (or needles) round its edge, as Watabou draws a crown: the ring's crests, not its rounded scallops.
      ctx.beginPath();
      clump.ring.forEach((p, k) => (k === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.closePath();
      ctx.fillStyle = body;
      ctx.fill();
      ctx.strokeStyle = mixColours(body, '#000000', 0.35);
      ctx.lineWidth = hand.weight('fine') * 1.2;
      ctx.stroke();
      ctx.beginPath();
      traceShape(ctx, clump.lit);
      ctx.fillStyle = mixColours(lit, deep, t ** 0.9);
      ctx.fill();
    },
    bare: (entry) => strokeLimbs(ctx, entry, look.bark, hand.weight('fine') * 2.4),
    finish: () => undefined,
    water: (waterScene, trace, outlines, depth, deepness) => paintWater(waterScene, { ...c, water: look.water }, trace, outlines, depth, false, deepness),
  });
}

/** Short blades of grass, a darker and a lighter shade of it. */
function blades(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, points: readonly { x: number; y: number; t: number }[], look: ForestLook): void {
  ctx.lineCap = 'round';
  ctx.lineWidth = 0.01;
  for (const [colour, from, to] of [[mixColours(look.grass, '#000000', 0.3), 0, 0.5], [mixColours(look.grass, '#ffffff', 0.25), 0.5, 1]] as const) {
    ctx.beginPath();
    for (const p of points) {
      if (p.t < from || p.t >= to) continue;
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x + 0.02, p.y - 0.06);
    }
    ctx.strokeStyle = colour;
    ctx.stroke();
  }
}

/** Monochrome: the look's own two pigments, the floor's light and the ink's dark (`paletteOf`). */
function monochrome(c: StoneColours): ForestLook {
  const tone = (t: number): string => mixColours(c.floor, c.line, t);
  return { woods: tone(0.75), canopy: { lit: tone(0.1), mid: tone(0.45), deep: tone(0.75) }, conifers: 0.3, bare: 0.03, bark: tone(0.9), ground: c.floor, grass: tone(0.15), path: tone(0.3), water: c.water };
}
