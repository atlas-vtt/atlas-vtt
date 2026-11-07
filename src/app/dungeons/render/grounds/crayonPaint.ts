/**
 * Crayon's grounds, as the Reprieve map draws its village: the lawn vellum washed in meadow with tufts of grass
 * in graphite crayon, thick where the grass grows in clumps and stray elsewhere; a hedge and every tree crown coloured in leaf green under
 * Engraved's scalloped outlines; water and glass in blue crayon. Gravel is washed, as Reprieve's road
 * is, with a few pebbles: Engraved's close stipple under crayon is more detail than a map's WebP holds.
 */

import type { Hand } from '../art/hand';
import { hash2, valueNoise } from '../art/noise';
import { rngFrom, type Rng } from '../../rng';
import { polysPath } from '../art/paths';
import type { Canvas2D } from '../geometry';
import type { Pens } from '../engraved/pens';
import { CRAYONS } from '../crayon/colours';
import type { CrayonBox } from '../crayon/crayonBox';
import { CRAYON_GROUNDS, colourGround, groundFields } from '../crayon/ground';
import { viewBounds } from '../art/artScene';
import { traceShape } from './crowns';
import { cutCrown } from './engravedCrown';
import { engravedGroundsPaint } from './engravedPaint';
import { scatter, tracePebbles, withClip, type GroundsPaint, type Scattered } from './paint';

/** The black crayon of the grass: the drawing's graphite, a little lighter. */
const TUFT_OPACITY = 0.75;

export function crayonGroundsPaint(hand: Hand, pens: Pens, box: CrayonBox): GroundsPaint {
  const { ctx, dungeon } = hand.scene.env;
  const seed = dungeon.model.seed;
  const lines = engravedGroundsPaint(hand, pens);
  const fine = hand.weight('fine');
  let ground: ReturnType<typeof groundFields> | null = null;
  const fields = (): ReturnType<typeof groundFields> => (ground ??= groundFields(seed));
  return {
    ...lines,
    lawn: (path, cells) => {
      box.paper(path);
      withClip(ctx, path, () => grassTufts(ctx, scatter(cells, 2.2, seed + 11), seed, pens.ink, fine * 1.15));
      // A light touch the paper still shows through, so the ground stays light under tokens.
      colourGround(box, path, CRAYON_GROUNDS.meadow, fields(), viewBounds(hand.scene.frame, 1));
    },
    gravel: (path, cells) => {
      // Reprieve's road: the paper washed in earth crayon, a pebble pencilled here and there.
      box.paper(path);
      box.colourIn(path, { colour: CRAYONS.earth, cover: 0.75, passes: 2 });
      withClip(ctx, path, () => {
        ctx.beginPath();
        tracePebbles(ctx, scatter(cells, 2.5, seed + 13), 0.014);
        ctx.strokeStyle = pens.ink;
        ctx.lineWidth = fine * 0.8;
        ctx.stroke();
      });
    },
    foliage: (rings, clump, salt, cells) => {
      lines.foliage(rings, clump, salt, cells);
      box.colourIn(polysPath(rings), { colour: CRAYONS.leaf, cover: 0.85, passes: 3 });
    },
    crown: (crown) =>
      cutCrown(hand, pens, crown, (clump) =>
        box.colourIn((path) => traceShape(path, clump.shape), { colour: crown.species === 'broadleaf' ? CRAYONS.leaf : CRAYONS.shadeLeaf, cover: 0.85, passes: 3 })),
    pool: (path, centre, radius) => {
      lines.pool(path, centre, radius);
      box.colourIn(path, { colour: CRAYONS.water, cover: 0.8, passes: 3 });
    },
    glass: (path) => box.colourIn(path, { colour: CRAYONS.water, cover: 0.35, passes: 1 }),
  };
}

/**
 * Tufts of grass, Reprieve's: four to six blades of uneven length from one short base, mostly
 * upright and each bowed its own way (an even fan reads as bird tracks), often in a little row;
 * many where the grass grows in clumps, a stray one elsewhere.
 */
function grassTufts(ctx: Canvas2D, points: readonly Scattered[], seed: number, ink: string, width: number): void {
  ctx.beginPath();
  for (const p of points) {
    const clump = valueNoise(p.x * 0.35, p.y * 0.35, seed + 41) * 0.7 + valueNoise(p.x * 0.9, p.y * 0.9, seed + 42) * 0.3;
    const chance = 0.03 + 0.85 * Math.min(1, Math.max(0, (clump - 0.45) / 0.3)) ** 2;
    if (p.t > chance) continue;
    const row = 1 + Math.floor(valueNoise(p.x * 7, p.y * 7, seed + 43) ** 2 * 3.5);
    const rand = rngFrom(Math.floor(hash2(Math.round(p.x * 997), Math.round(p.y * 991), seed + 45) * 0xffffffff));
    for (let k = 0; k < row; k++) tuft(ctx, p.x + k * (0.05 + rand() * 0.05), p.y + (rand() - 0.5) * 0.02, rand);
  }
  ctx.save();
  ctx.strokeStyle = ink;
  ctx.globalAlpha = TUFT_OPACITY;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.stroke();
  ctx.restore();
}

/** One tuft standing at (x, y), its blades in cells. */
function tuft(ctx: Canvas2D, x: number, y: number, rand: Rng): void {
  const blades = 4 + Math.floor(rand() * 3);
  const height = 0.06 + rand() * 0.05;
  const lean = (rand() - 0.5) * 0.3;
  for (let k = 0; k < blades; k++) {
    const side = (k / (blades - 1)) * 2 - 1;
    const angle = -Math.PI / 2 + side * 0.38 + lean + (rand() - 0.5) * 0.2;
    const length = height * (0.45 + 0.55 * rand()) * (1 - 0.25 * Math.abs(side));
    const bx = x + side * 0.015 + (rand() - 0.5) * 0.006;
    const tx = bx + Math.cos(angle) * length;
    const ty = y + Math.sin(angle) * length;
    const bend = (rand() - 0.3 * Math.sign(side) - 0.35) * length * 0.22;
    ctx.moveTo(bx, y);
    ctx.quadraticCurveTo(bx + Math.cos(angle) * length * 0.55 - Math.sin(angle) * bend, y + Math.sin(angle) * length * 0.55 + Math.cos(angle) * bend, tx, ty);
  }
}
