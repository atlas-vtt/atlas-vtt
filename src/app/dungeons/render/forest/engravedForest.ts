import type { ArtScene } from '../art/artScene';
import { viewBounds } from '../art/artScene';
import { engravedHand } from '../engraved/hand';
import { pensOf } from '../engraved/pens';
import { paintWater } from '../engraved/water';
import { traceShape } from '../grounds/crowns';
import { engravedGroundsPaint } from '../grounds/engravedPaint';
import { mapLayout } from '../layoutSize';
import { mixColours, withAlpha } from '../palette';
import { drawVellum } from '../vellum';
import { forestLookOf } from '../../forestLooks';
import { colourIn, strokeLimbs } from './forestPaint';
import { drawForest, massShare } from './drawForest';

/** How much of the woods' colour the paper takes, and how strongly its grain shows: the woods a flat tone beyond the trees, as stone's are, never one hatch over the whole frame. */
const WOODS_TINT = 0.7;
const WOODS_GRAIN = 1.5;

/**
 * Engraved's forest: the woods a tone of the paper beyond the trees; each clump of
 * the mass paper with an ink outline that lightens into the mass, the lit part's edge cut at the
 * clearing; then the whole mass hatched the deeper it stands, so it sinks into the woods.
 */
export function paintEngravedForest(scene: ArtScene): void {
  const pens = pensOf(scene);
  const hand = engravedHand(scene, pens);
  const { ctx } = scene.env;
  const b = viewBounds(scene.frame, 1);
  const { env } = scene;
  const { dungeon } = env;
  const look = forestLookOf(env.style);
  drawForest(scene, {
    hand,
    ground: engravedGroundsPaint(hand, pens),
    colours: { water: look.water, cloth: pens.floor },
    woods: () => {
      // The paper as vellum, a little of the woods' colour in it, under the hatch.
      const layout = mapLayout(dungeon.model, env.pxPerCell, env.view);
      ctx.save();
      ctx.translate(layout.originCell.x, layout.originCell.y);
      ctx.scale(1 / env.pxPerCell, 1 / env.pxPerCell);
      drawVellum(ctx, mixColours(pens.floor, look.woods, WOODS_TINT), layout, dungeon.model.seed, !scene.raster, 1, true, WOODS_GRAIN);
      ctx.restore();
    },
    // Worn ground in a light tone of the path's, its edges inked: a road an engraver draws as its outline.
    trail: (path, fade, edges) => {
      colourIn(scene, path, look.path, (x, y) => 0.5 * fade({ x, y }));
      hand.line(edges, 'fine', true);
    },
    bare: (entry) => strokeLimbs(ctx, entry, pens.ink, hand.weight('fine') * 2),
    clump: ({ clump, depth }) => {
      const edge = 1 - massShare(depth);
      ctx.beginPath();
      traceShape(ctx, clump.shape);
      ctx.fillStyle = pens.floor;
      ctx.fill();
      ctx.strokeStyle = withAlpha(pens.ink, 0.3 + 0.7 * edge);
      ctx.lineWidth = hand.weight('outline') * (0.7 + 0.3 * edge);
      ctx.stroke();
      if (edge > 0.5) {
        ctx.save();
        ctx.clip();
        ctx.beginPath();
        traceShape(ctx, clump.lit);
        ctx.strokeStyle = withAlpha(pens.ink, 0.6 * edge);
        ctx.lineWidth = hand.weight('fine');
        ctx.stroke();
        ctx.restore();
      }
    },
    finish: (mass, depth) => {
      const union = (path: CanvasPath): void => { for (const { clump } of mass) traceShape(path, clump.shape); };
      hand.tone((x, y) => 0.75 * depth(x, y) ** 1.3, b, union, 'shade');
    },
    water: (waterScene, trace, outlines, depth, deepness) => paintWater(waterScene, { ...pens, water: look.water }, trace, outlines, depth, false, deepness),
  });
}
