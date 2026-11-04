import { rngFrom } from '../../../rng';
import { viewBounds, type ArtScene } from '../../art/artScene';
import { shadeEdges, TO_LIGHT } from '../../art/light';
import { hash2 } from '../../art/noise';
import { grownRings, traceRings } from '../../art/outline';
import { centroid, polyPath, runsPath } from '../../art/paths';
import type { Pens } from '../../engraved/pens';
import type { Canvas2D, Vec } from '../../geometry';
import { mixColours, withAlpha } from '../../palette';
import { filledPockets, inPocket, type Pocket } from '../../pockets';
import { strokeWidth } from '../../renderEnv';
import { stoneOutline } from '../../terrain/stones';
import type { StoneColours } from '../../stone/colours';
import { FacetBatch, rockTones, stoneFacets, toneStep } from '../../stone/rockFacets';
import { enclosedRock } from './enclosedRock';

/** How far the bed under the slabs reaches from the wall, as a share of the look's reach. */
const BED = 0.3;
/** How much wider than its slab the bed round it is. */
const BED_ROUND = 1.18;
/** How far round each slab the bed fills the reach, as a share of the slab, closing the gaps between neighbours. */
const BED_SPAN = 2.2;
/** How far from the wall the bed between slabs reaches, as a share of the look's reach: short of the outermost slabs. */
const BED_FAR = 0.7;

function clipLanes(scene: ArtScene): void {
  const { ctx, dungeon } = scene.env;
  const { open } = dungeon;
  if (!open.length) return;
  const b = viewBounds(scene.frame, 10);
  ctx.beginPath();
  ctx.rect(b.minX, b.minY, b.maxX - b.minX, b.maxY - b.minY);
  // The same open ground as the built surround's: rock never closes an entrance's mouth or its way out.
  for (const ground of open) polyPath(ground)(ctx);
  ctx.clip('evenodd');
}

/**
 * Loose fracture slabs, keyed to map coordinates, with neither courses nor a room seam: within
 * the look's reach of the walls, and all through the rock the rooms close in on.
 */
function slabs(scene: ArtScene, pockets: readonly Pocket[]): Vec[][] {
  const { dungeon, style } = scene.env;
  const seed = dungeon.model.seed + dungeon.index * 101;
  const size = Math.max(0.16, style.surround.size);
  const step = size * 0.85;
  const reach = style.surround.reach;
  const b = viewBounds(scene.frame, reach + size);
  const out: Vec[][] = [];
  for (let j = Math.floor(b.minY / step); j <= b.maxY / step; j++) {
    for (let i = Math.floor(b.minX / step); i <= b.maxX / step; i++) {
      const x = (i + hash2(i, j, seed + 31)) * step;
      const y = (j + hash2(i, j, seed + 32)) * step;
      const distance = dungeon.field.distance(x, y);
      if (distance < -size * 0.5) continue;
      const enclosed = distance > reach * 0.65 && inPocket(pockets, x, y);
      if (distance > reach * 0.65 && !enclosed) continue;
      const radius = size * (0.42 + hash2(i, j, seed + 33) * 0.3);
      const rng = rngFrom(Math.floor(hash2(i, j, seed + 34) * 0xffffffff));
      const poly = stoneOutline(rng, { x, y }, radius);
      // Keep the look's reach, breaking off whole slabs at its outside, never a ruled border.
      if (!enclosed && poly.some(p => dungeon.field.distance(p.x, p.y) > reach && !inPocket(pockets, p.x, p.y))) continue;
      out.push(poly);
    }
  }
  return out;
}

function fillPockets(scene: ArtScene, pockets: readonly Pocket[], colour: string): void {
  const { ctx } = scene.env;
  ctx.beginPath();
  traceRings(ctx, pockets.map(pocket => pocket.ring));
  ctx.fillStyle = colour;
  ctx.fill();
}

/**
 * The rock's bed under the slabs, showing in their cracks: along the wall, round every slab a
 * little wider than it, most of the way out between slabs that lie close, and all through the
 * enclosed rock, so its outer edge is the slabs' own.
 */
function fillBed(scene: ArtScene, slabs: readonly Vec[][], enclosed: readonly Pocket[], colour: string): void {
  const { ctx, style } = scene.env;
  const around = (k: number): void => {
    for (const poly of slabs) {
      const middle = centroid(poly);
      polyPath(poly.map(p => ({ x: middle.x + (p.x - middle.x) * k, y: middle.y + (p.y - middle.y) * k })))(ctx);
    }
  };
  ctx.fillStyle = colour;
  ctx.beginPath();
  traceRings(ctx, grownRings(scene, style.surround.reach * BED));
  traceRings(ctx, enclosed.map(pocket => pocket.ring));
  around(BED_ROUND);
  ctx.fill();
  ctx.save();
  ctx.beginPath();
  around(BED_SPAN);
  ctx.clip();
  ctx.beginPath();
  traceRings(ctx, grownRings(scene, style.surround.reach * BED_FAR));
  ctx.fill('evenodd');
  ctx.restore();
}

function strokeFracture(scene: ArtScene, poly: Vec[], colour: string, width: number): void {
  const { ctx } = scene.env;
  const a = poly[1]!;
  const b = poly[4]!;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(a.x * 0.4 + b.x * 0.6, a.y * 0.65 + b.y * 0.35);
  ctx.lineTo(b.x, b.y);
  ctx.strokeStyle = colour;
  ctx.lineWidth = width;
  ctx.stroke();
}

export function stoneSurround(scene: ArtScene, c: StoneColours): void {
  const { ctx, style, dungeon } = scene.env;
  const ink = strokeWidth(scene.env, style.surround.stroke);
  const pockets = filledPockets(dungeon, style.surround.reach);
  const enclosed = enclosedRock(scene, pockets, style.surround.reach);
  const tones = rockTones(c);
  const seed = dungeon.model.seed + dungeon.index * 101;
  ctx.save();
  clipLanes(scene);
  const laid = slabs(scene, enclosed);
  if (scene.raster) fillBed(scene, laid, enclosed, tones[0]!);
  else fillPockets(scene, pockets, c.rock);
  ctx.lineJoin = 'round';
  for (const poly of laid) {
    if (scene.raster) facetSlab(ctx, poly, tones, seed);
    else {
      ctx.beginPath();
      polyPath(poly)(ctx);
      ctx.fillStyle = c.rock;
      ctx.fill();
    }
    // Split faces, rather than the rectangular joints of a dressed course.
    ctx.beginPath();
    polyPath(poly)(ctx);
    ctx.strokeStyle = withAlpha(c.line, 0.52);
    ctx.lineWidth = ink;
    ctx.stroke();
    ctx.save();
    ctx.translate(TO_LIGHT.x * 0.008, TO_LIGHT.y * 0.008);
    ctx.beginPath();
    runsPath(shadeEdges(poly, false))(ctx);
    ctx.strokeStyle = withAlpha(c.light, c.dark ? 0.2 : 0.5);
    ctx.lineWidth = 0.012;
    ctx.stroke();
    ctx.restore();
    strokeFracture(scene, poly, withAlpha(c.line, 0.22), 0.007);
  }
  ctx.restore();
}

/** A slab's planes, each one tone of the rock by its facing. */
function facetSlab(ctx: Canvas2D, poly: Vec[], tones: readonly string[], seed: number): void {
  const batch = new FacetBatch(tones);
  for (const { face, light } of stoneFacets(poly, seed, light => toneStep(light, 4))) batch.add(face, light, 4);
  batch.fill(ctx);
}

export function engravedSurround(scene: ArtScene, pens: Pens): void {
  const { ctx, style, dungeon } = scene.env;
  const ink = strokeWidth(scene.env, style.surround.stroke);
  ctx.save();
  const pockets = filledPockets(dungeon, style.surround.reach);
  clipLanes(scene);
  fillPockets(scene, pockets, mixColours(pens.floor, pens.ink, 0.12));
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  for (const poly of slabs(scene, enclosedRock(scene, pockets, style.surround.reach))) {
    ctx.beginPath();
    polyPath(poly)(ctx);
    ctx.fillStyle = pens.floor;
    ctx.fill();
    ctx.strokeStyle = pens.ink;
    ctx.lineWidth = ink;
    ctx.stroke();
    ctx.beginPath();
    runsPath(shadeEdges(poly, true))(ctx);
    ctx.lineWidth = ink * 1.8;
    ctx.stroke();
    strokeFracture(scene, poly, withAlpha(pens.ink, 0.5), 0.009);
  }
  ctx.restore();
}
