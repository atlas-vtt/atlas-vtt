import type { ArtScene } from '../art/artScene';
import { viewBounds } from '../art/artScene';
import { CRAYONS } from '../crayon/colours';
import { crayonBox } from '../crayon/crayonBox';
import { crayonHand } from '../crayon/hand';
import { crayonPens } from '../crayon/pens';
import { crayonWater } from '../crayon/pools';
import { traceShape } from '../grounds/crowns';
import { crayonGroundsPaint } from '../grounds/crayonPaint';
import { mapLayout } from '../layoutSize';
import { mixColours, withAlpha } from '../palette';
import { drawVellum } from '../vellum';
import { drawForest, massShare } from './drawForest';
import { strokeLimbs } from './forestPaint';

/** The woods' vellum: a light green, lighter than the mass's coats, so the mass stands out as the woods' edge. */
const WOODS = '#94ab84';
/** How much stronger the woods' vellum grain is than the paper's: a mid green shows little of it. */
const WOODS_GRAIN = 3;

/**
 * Crayon's forest: the woods in two coats of green; the clearings a meadow as every crayon lawn is
 * (`CRAYON_GROUNDS.meadow`); clumps in paper with graphite
 * outlines that fade into the mass and a curl along each lit part at its edge, then one coat over the
 * whole mass, leaf green at the clearing, shade green deeper in.
 */
export function paintCrayonForest(scene: ArtScene): void {
  const pens = crayonPens(scene);
  const box = crayonBox(scene);
  const hand = crayonHand(scene, pens, box);
  const { ctx, dungeon } = scene.env;
  const b = viewBounds(scene.frame, 1);
  drawForest(scene, {
    hand,
    ground: crayonGroundsPaint(hand, pens, box),
    colours: { water: pens.water, cloth: pens.floor },
    woods: () => {
      // The woods are vellum in a green, as the paper round every map is, its grain strong enough to
      // show on the tint: crayon over the woods doubled a scene's map (10 MB of lossy WebP, 6 s to
      // encode), the vellum costs about what flat colour does. Monochrome: graphite's tone of the paper.
      const green = scene.env.view.monochrome ? mixColours(pens.floor, pens.ink, 0.35) : WOODS;
      const layout = mapLayout(dungeon.model, scene.env.pxPerCell, scene.env.view);
      ctx.save();
      ctx.translate(layout.originCell.x, layout.originCell.y);
      ctx.scale(1 / scene.env.pxPerCell, 1 / scene.env.pxPerCell);
      drawVellum(ctx, green, layout, dungeon.model.seed, !scene.raster, 1, true, WOODS_GRAIN);
      ctx.restore();
    },
    trail: (path, fade) => box.colourIn(path, { colour: CRAYONS.earth, cover: 0.55, passes: 2 }, (x, y) => fade({ x, y }), b),
    bare: (entry) => strokeLimbs(ctx, entry, pens.ink, hand.weight('fine') * 2),
    clump: ({ clump, depth }) => {
      ctx.beginPath();
      traceShape(ctx, clump.shape);
      ctx.fillStyle = pens.floor;
      ctx.fill();
      const edge = (1 - massShare(depth)) ** 1.5;
      ctx.strokeStyle = withAlpha(pens.ink, 0.12 + 0.83 * edge);
      // Never thinner than a pixel and a half of the picture, or a map seen whole loses its trees' outlines under the crayon.
      ctx.lineWidth = Math.max(hand.weight('outline') * (0.6 + 0.4 * edge), (1.5 * edge) / scene.env.pxPerCell);
      ctx.stroke();
      // Reprieve's curl: the lit part's edge inked inside the clumps of the mass's edge.
      if (edge > 0.35) {
        ctx.save();
        ctx.clip();
        ctx.beginPath();
        traceShape(ctx, clump.lit);
        ctx.strokeStyle = withAlpha(pens.ink, 0.55 * edge);
        ctx.lineWidth = hand.weight('fine');
        ctx.stroke();
        ctx.restore();
      }
    },
    finish: (mass, depthAt) => {
      const union = (path: CanvasPath): void => { for (const { clump } of mass) traceShape(path, clump.shape); };
      box.colourIn(union, { colour: CRAYONS.leaf, cover: 1, passes: 3 }, (x, y) => 1 - depthAt(x, y), b);
      box.colourIn(union, { colour: CRAYONS.shadeLeaf, cover: 1, passes: 3 }, depthAt, b);
    },
    water: (waterScene, trace, outlines, depth, deepness) => crayonWater(box)(waterScene, pens, trace, outlines, depth, false, deepness),
  });
}
