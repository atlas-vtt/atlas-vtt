import type { ArtScene } from '../art/artScene';
import { pensOf, type Pens } from '../engraved/pens';
import { mixColours } from '../palette';
import { vellumColours } from '../vellum';
import { CRAYONS, PLANT_TINT } from './colours';

/**
 * Crayon draws with Engraved's pens in graphite, and whatever they fill (a piece, a raised floor,
 * the paper under a crown) takes the vellum's colour where the map lies, so it covers what is
 * under it as the paper does; the crayon goes on after.
 */
export function crayonPens(scene: ArtScene): Pens {
  const pens = pensOf(scene);
  const paper = vellumColours(scene.env.palette.paper).inner;
  return { ...pens, floor: paper, water: paper };
}

/** The pens plants are drawn with: filled with a tint of leaf green, monochrome's paper left alone. */
export function plantPens(pens: Pens): Pens {
  return pens.mono ? pens : { ...pens, floor: mixColours(pens.floor, CRAYONS.leaf, PLANT_TINT) };
}
