import type { ArtScene } from '../art/artScene';
import type { Hand, Material } from '../art/hand';
import { pathBounds, polysPath, type Field, type PathFn } from '../art/paths';
import type { Bounds, Vec } from '../geometry';
import { runsPath } from '../art/paths';
import { crayonPaint } from './tooth';
import { mixColours } from '../palette';
import { groundAt } from './floorMaterials';
import { CRAYON_GROUNDS, type CrayonGroundId } from './ground';
import { engravedHand } from '../engraved/hand';
import type { Pens } from '../engraved/pens';
import { CRAYONS, FLOOR_SURFACE, MATERIAL_CRAYONS } from './colours';
import type { CrayonBox } from './crayonBox';
import { crayonMolten } from './molten';
import { crayonWater } from './pools';

/** How much of the floor's crayon a piece's paper fill takes: about what the floor's coats leave on the paper on average. */
const PIECE_TINT = 0.3;

/**
 * Crayon's hand: Engraved's lines, shade hatching and modelling in graphite, every surface
 * coloured in with its material's crayon (a surface of floor, a slab or a bed, in the ground of the
 * floor it lies on, packed earth off the floors), water in blue crayon heavier as it deepens and
 * molten rock in ember with a flame core and an umber crust (`crayonMolten`). A piece is filled with the paper tinted by the floor's ground
 * under it, so its fill never stands out pale on a coloured floor.
 */
export function crayonHand(scene: ArtScene, pens: Pens, box: CrayonBox): Hand {
  const lines = engravedHand(scene, pens);
  const water = crayonWater(box);
  const ground = groundAt(scene);
  const groundUnder = (path: PathFn): CrayonGroundId | null => {
    const b = pathBounds(path);
    return b ? ground((b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2) : null;
  };
  const colour = (path: PathFn, material: Material): void => {
    const fill = material === 'floor' ? { ...FLOOR_SURFACE, colour: CRAYON_GROUNDS[groundUnder(path) ?? 'earth'][0].colour } : MATERIAL_CRAYONS[material];
    if (fill) box.colourIn(path, fill);
  };
  // A forest's clearings keep their pieces in the paper they were approved in.
  const tinted = !scene.env.dungeon.floor.forest && !scene.env.view.monochrome;
  const hand: Hand = {
    ...lines,
    fillAt: (x, y) => {
      const id = tinted ? ground(x, y) : null;
      return id ? mixColours(pens.floor, CRAYON_GROUNDS[id][0].colour, PIECE_TINT) : undefined;
    },
    surface: (path, material) => {
      lines.surface(path, material);
      colour(path, material);
    },
    fill: (path, material) => {
      lines.fill(path, material);
      colour(path, material);
    },
    grain: (path, material) => {
      lines.grain(path, material);
      colour(path, material);
    },
    water: (pools, depth, deep) => water(scene, pens, polysPath(pools), pools, depth, deep),
    // Monochrome is graphite alone: its shade stays the engraving's hatching.
    ...(scene.env.view.monochrome ? {} : {
      wax: (path: PathFn, cover: number, passes: number, strength?: Field, bounds?: Bounds) => box.colourIn(path, { colour: CRAYONS.umber, cover, passes }, strength, bounds),
      waxStroke: (runs: readonly (readonly Vec[])[], width: number, cover: number) => waxStroke(scene, runs, width, cover),
    }),
    lava: (pools, tint, flow) => {
      lines.lava(pools, tint, flow);
      crayonMolten(scene, box, pools, tint, flow);
    },
  };
  return hand;
}

/** Broad umber strokes along runs, multiplied onto the drawing on the paper's tooth: shade as a hand lays it along an edge. */
function waxStroke(scene: ArtScene, runs: readonly (readonly Vec[])[], width: number, cover: number): void {
  const { ctx } = scene.env;
  ctx.save();
  ctx.beginPath();
  runsPath(runs)(ctx);
  ctx.globalCompositeOperation = scene.raster ? 'multiply' : 'source-over';
  ctx.globalAlpha = cover;
  ctx.strokeStyle = scene.raster ? crayonPaint(ctx, CRAYONS.umber) : CRAYONS.umber;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();
  ctx.restore();
}
