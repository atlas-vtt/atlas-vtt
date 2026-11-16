import { viewBounds, type ArtScene } from '../art/artScene';
import { castShadow, type Hand } from '../art/hand';
import { TO_LIGHT } from '../art/light';
import { grownRings, traceRings } from '../art/outline';
import type { Canvas2D, Vec } from '../geometry';
import { inView, type Leaf, type PlantForm } from '../growth/forms';
import { growthPicture } from '../growth/growthForms';
import { placeLeaf, plainLeaves, silhouette, stemRibbon } from '../growth/leafGeometry';
import { mossField, mossResolution } from '../growth/mossField';
import { hash2 } from '../art/noise';
import { poolOutlines, poolsPath } from '../art/pools';
import type { GrowthPainter } from '../stone/growth';
import { BAND } from '../stone/walls';
import { cellPattern } from '../stone/patterns';
import { pensOf, type Pens } from './pens';

/**
 * Engraved's plants, cut in line: every leaf outlined in ink over the paper, its rib cut, and the
 * half turned from the light hatched at the burin's angle (the deeper in its plant, the closer the
 * lines, and the deepest cross-hatched); stems as double contours; fungus caps with a hatched
 * crescent; moss stippled, the dots gathered in its hollows. Where the context draws no pictures
 * (the SVG export), hatching is left out and the outlines carry the plant alone.
 */

/** A seamless tile of lines at 45°, so hatching is one pattern fill and no clip per leaf. */
function hatchTile(colour: string, periodPx: number, widthPx: number, cross: boolean): OffscreenCanvas {
  const lines = 4;
  const size = Math.max(8, Math.round(periodPx * Math.SQRT2 * lines));
  const tile = new OffscreenCanvas(size, size);
  const ctx = tile.getContext('2d')!;
  ctx.strokeStyle = colour;
  ctx.lineWidth = widthPx;
  ctx.lineCap = 'butt';
  const step = size / lines;
  ctx.beginPath();
  for (let k = -1; k <= lines * 2 + 1; k++) {
    // x + y = k · step: the burin's lines, up to the right; across them x − y = k · step.
    ctx.moveTo(k * step, 0);
    ctx.lineTo(k * step - size, size);
    if (cross) {
      ctx.moveTo(k * step - size, 0);
      ctx.lineTo(k * step, size);
    }
  }
  ctx.stroke();
  return tile;
}

interface Hatches {
  light: CanvasPattern;
  dense: CanvasPattern;
  cross: CanvasPattern;
}

/** Below this many pixels a cell, leaves are too small to hatch: their outlines alone give their tone. */
const LEAST_HATCHED_PX = 80;

function hatchesOf(scene: ArtScene, pens: Pens): Hatches | null {
  if (!scene.raster || scene.frame.pxPerCell < LEAST_HATCHED_PX) return null;
  const { ctx } = scene.env;
  const ppc = scene.frame.pxPerCell;
  const period = Math.max(3, pens.spacing * 0.5 * ppc);
  const make = (p: number, w: number, cross: boolean): CanvasPattern => {
    const tile = hatchTile(pens.shade, p, w, cross);
    return cellPattern(ctx, tile, tile.width / ppc);
  };
  return { light: make(period * 1.25, Math.max(0.6, period * 0.26), false), dense: make(period, Math.max(0.7, period * 0.36), false), cross: make(period, Math.max(0.6, period * 0.3), true) };
}

function polygon(ctx: Canvas2D, points: readonly Vec[]): void {
  ctx.moveTo(points[0]!.x, points[0]!.y);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i]!.x, points[i]!.y);
  ctx.closePath();
}

function cutLeaf(ctx: Canvas2D, leaf: Leaf, pens: Pens, hatches: Hatches | null, line: number): void {
  const placed = placeLeaf(leaf);
  const [lit, shaded] = placed.facing >= 0 ? [placed.left, placed.right] : [placed.right, placed.left];
  ctx.beginPath();
  polygon(ctx, lit);
  polygon(ctx, shaded);
  ctx.fillStyle = pens.floor;
  ctx.fill();
  // Small leaves are left to their outlines: hatched, a frond of them would be a black mass.
  if (hatches && leaf.shape !== 'blade' && leaf.length > 0.06) {
    ctx.beginPath();
    polygon(ctx, shaded);
    ctx.fillStyle = leaf.layer < 0.25 ? hatches.cross : leaf.layer < 0.6 ? hatches.dense : hatches.light;
    ctx.fill();
    if (leaf.layer < 0.35) {
      ctx.beginPath();
      polygon(ctx, lit);
      ctx.fillStyle = hatches.light;
      ctx.fill();
    }
  }
  ctx.beginPath();
  polygon(ctx, lit);
  polygon(ctx, shaded);
  ctx.strokeStyle = pens.ink;
  ctx.lineWidth = leaf.shape === 'blade' || leaf.shape === 'pinna' ? line * 0.7 : line;
  ctx.stroke();
  if (leaf.shape === 'blade' || leaf.length < line * 12) return;
  ctx.beginPath();
  for (const run of [placed.rib, ...placed.veins]) {
    ctx.moveTo(run[0]!.x, run[0]!.y);
    for (let i = 1; i < run.length; i++) ctx.lineTo(run[i]!.x, run[i]!.y);
  }
  ctx.lineWidth = line * 0.6;
  ctx.stroke();
}

function cutStems(ctx: Canvas2D, form: PlantForm, pens: Pens, hatches: Hatches | null, line: number): void {
  for (const hole of form.holes) {
    ctx.beginPath();
    ctx.ellipse(hole.x, hole.y, hole.radius * 1.15, hole.radius * 0.75, hole.angle, 0, Math.PI * 2);
    ctx.fillStyle = hatches ? hatches.cross : pens.floor;
    ctx.fill();
    ctx.strokeStyle = pens.ink;
    ctx.lineWidth = line * 0.8;
    ctx.stroke();
  }
  for (const stem of form.stems) {
    const thick = stem.from > line * 4;
    if (!thick) {
      ctx.beginPath();
      ctx.moveTo(stem.points[0]!.x, stem.points[0]!.y);
      for (const p of stem.points) ctx.lineTo(p.x, p.y);
      ctx.strokeStyle = pens.ink;
      ctx.lineWidth = Math.max(line * 0.7, Math.min(stem.from, line * 1.6));
      ctx.lineCap = 'round';
      ctx.stroke();
      continue;
    }
    const ribbon = stemRibbon(stem);
    ctx.beginPath();
    polygon(ctx, ribbon);
    ctx.fillStyle = pens.floor;
    ctx.fill();
    ctx.beginPath();
    polygon(ctx, ribbon);
    ctx.strokeStyle = pens.ink;
    ctx.lineWidth = line;
    ctx.stroke();
    // The engraver's shade line: the contour away from the light cut heavier.
    const n = stem.points.length;
    ctx.beginPath();
    stem.points.forEach((p, i) => {
      const w = (stem.widths?.[i] ?? stem.from + (stem.to - stem.from) * (i / Math.max(1, n - 1))) * 0.42;
      const q = { x: p.x - TO_LIGHT.x * w, y: p.y - TO_LIGHT.y * w };
      if (i === 0) ctx.moveTo(q.x, q.y);
      else ctx.lineTo(q.x, q.y);
    });
    ctx.lineWidth = line * 1.8;
    ctx.lineCap = 'round';
    ctx.stroke();
  }
}

function cutCaps(ctx: Canvas2D, form: PlantForm, pens: Pens, hatches: Hatches | null, line: number): void {
  for (const cap of [...form.caps].sort((a, b) => a.layer - b.layer)) {
    ctx.beginPath();
    ctx.ellipse(cap.x, cap.y, cap.radius * cap.stretch, cap.radius, cap.angle, 0, Math.PI * 2);
    ctx.fillStyle = pens.floor;
    ctx.fill();
    if (hatches) {
      ctx.save();
      ctx.clip();
      ctx.beginPath();
      // The crescent away from the light: the cap less a copy of it moved towards the light.
      ctx.ellipse(cap.x, cap.y, cap.radius * cap.stretch, cap.radius, cap.angle, 0, Math.PI * 2);
      ctx.ellipse(cap.x + TO_LIGHT.x * cap.radius * 0.45, cap.y + TO_LIGHT.y * cap.radius * 0.45, cap.radius * cap.stretch, cap.radius, cap.angle, 0, Math.PI * 2);
      ctx.fillStyle = hatches.dense;
      ctx.fill('evenodd');
      ctx.restore();
    }
    ctx.beginPath();
    ctx.ellipse(cap.x, cap.y, cap.radius * cap.stretch, cap.radius, cap.angle, 0, Math.PI * 2);
    ctx.strokeStyle = pens.ink;
    ctx.lineWidth = line;
    ctx.stroke();
  }
}

function cutBlossoms(ctx: Canvas2D, form: PlantForm, pens: Pens, line: number): void {
  for (const b of form.blossoms) {
    ctx.beginPath();
    for (let k = 0; k < b.petals; k++) {
      const a = b.angle + (k * Math.PI * 2) / b.petals;
      const cx = b.x + Math.cos(a) * b.radius * 0.55;
      const cy = b.y + Math.sin(a) * b.radius * 0.55;
      ctx.moveTo(cx + Math.cos(a) * b.radius * 0.55, cy + Math.sin(a) * b.radius * 0.55);
      ctx.ellipse(cx, cy, b.radius * 0.55, b.radius * 0.36, a, 0, Math.PI * 2);
    }
    ctx.fillStyle = pens.floor;
    ctx.fill();
    ctx.strokeStyle = pens.ink;
    ctx.lineWidth = line * 0.7;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.radius * 0.18, 0, Math.PI * 2);
    ctx.fillStyle = pens.ink;
    ctx.fill();
  }
}

function cutForm(scene: ArtScene, form: PlantForm, pens: Pens, hatches: Hatches | null, onlyAbove = -1): void {
  const { ctx } = scene.env;
  if (!scene.raster) {
    // A picture that records every path keeps a plant as its outlines alone, in one path.
    ctx.save();
    if (onlyAbove < 0) cutStems(ctx, { ...form, stems: form.stems.filter(stem => stem.from >= 0.02) }, pens, null, 0.006);
    ctx.beginPath();
    for (const { outline } of plainLeaves(form.leaves.filter(l => l.layer > onlyAbove))) polygon(ctx, outline);
    ctx.fillStyle = pens.floor;
    ctx.fill();
    ctx.strokeStyle = pens.ink;
    ctx.lineWidth = 0.006;
    ctx.stroke();
    ctx.restore();
    return;
  }
  // A little finer than the look's own fine line, so leaves read as drawn, not as noise; drawn small,
  // a third of a pixel, so a plant reads as a grey of its lines instead of a blot.
  const line = Math.max(0.35 / scene.frame.pxPerCell, 0.0062);
  ctx.save();
  ctx.lineJoin = 'round';
  if (onlyAbove < 0) cutStems(ctx, form, pens, hatches, line);
  for (const leaf of form.leaves.filter(l => l.layer > onlyAbove).sort((a, b) => a.layer - b.layer)) cutLeaf(ctx, leaf, pens, hatches, line);
  if (onlyAbove < 0) {
    cutBlossoms(ctx, form, pens, line);
    cutCaps(ctx, form, pens, hatches, line);
  }
  ctx.restore();
}

/** Moss as stipple: a dot where a seeded draw falls under how deep in shade the cushion lies there. */
function stippleMoss(scene: ArtScene, pens: Pens): void {
  // Thousands of dots would swell an SVG: the export leaves moss out.
  if (!scene.raster) return;
  const { env } = scene;
  const { ctx } = env;
  const view = viewBounds(scene.frame, 1);
  const res = Math.min(mossResolution(scene.frame.pxPerCell), 90);
  const seed = env.dungeon.model.seed;
  const dot = Math.max(0.0045, 0.55 / scene.frame.pxPerCell);
  ctx.save();
  ctx.beginPath();
  traceRings(ctx, grownRings(scene, BAND));
  ctx.clip();
  ctx.beginPath();
  ctx.rect(view.minX, view.minY, view.maxX - view.minX, view.maxY - view.minY);
  poolsPath(poolOutlines(scene))(ctx);
  ctx.clip('evenodd');
  ctx.fillStyle = pens.ink;
  for (const cluster of growthPicture(env).moss) {
    if (!cluster.some(s => s.x + s.radius > view.minX && s.x - s.radius < view.maxX && s.y + s.radius > view.minY && s.y - s.radius < view.maxY)) continue;
    const field = mossField(cluster, res, seed);
    if (!field) continue;
    const { grid, cover, light } = field;
    ctx.beginPath();
    for (let j = 0; j < grid.h; j++) {
      for (let i = 0; i < grid.w; i++) {
        const k = j * grid.w + i;
        const c = cover[k]!;
        if (c <= 0.05) continue;
        const chance = c * (0.12 + 0.6 * (1 - light[k]!) ** 1.6);
        if (hash2(i, j, seed + 71) > chance) continue;
        const x = grid.x0 + (i + hash2(i, j, seed + 72)) / grid.res;
        const y = grid.y0 + (j + hash2(i, j, seed + 73)) / grid.res;
        ctx.moveTo(x + dot, y);
        ctx.arc(x, y, dot * (0.7 + 0.6 * hash2(i, j, seed + 74)), 0, Math.PI * 2);
      }
    }
    ctx.fill();
  }
  ctx.restore();
}

/** Each scene's pens and hatches, worked out once from its look (by the vegetation's painter, where it ran first). */
const sceneCuts = new WeakMap<ArtScene, { pens: Pens; hatches: Hatches | null }>();

/**
 * Cuts one plant form as Engraved cuts the vegetation, in the scene's pens: for a piece drawn from
 * the vegetation's forms (a cave's mushrooms), on a context already set to where the form's cells lie.
 */
export function cutPlantForm(scene: ArtScene, form: PlantForm): void {
  let cuts = sceneCuts.get(scene);
  if (!cuts) {
    const pens = pensOf(scene);
    cuts = { pens, hatches: hatchesOf(scene, pens) };
    sceneCuts.set(scene, cuts);
  }
  cutForm(scene, form, cuts.pens, cuts.hatches);
  // A picture that records every path keeps the vegetation's leaves alone; a piece keeps its caps.
  if (!scene.raster) cutCaps(scene.env.ctx, form, cuts.pens, null, 0.006);
}

export function engravedGrowth(scene: ArtScene, hand: Hand, pens: Pens): GrowthPainter {
  const hatches = hatchesOf(scene, pens);
  sceneCuts.set(scene, { pens, hatches });
  const view = viewBounds(scene.frame, 1);
  const shown = (forms: readonly PlantForm[]): PlantForm[] => forms.filter(form => inView(form, view));
  // The SVG export keeps no plant's shadow: hatched, each would be hundreds of lines.
  const shadow = (form: PlantForm, strength: number): void => {
    if (scene.raster) castShadow(hand, silhouette(form), form.lift, form.bounds, strength);
  };
  const picture = (): ReturnType<typeof growthPicture> => growthPicture(scene.env);
  return {
    ground: () => {
      stippleMoss(scene, pens);
      for (const form of shown(picture().ground)) {
        shadow(form, 0.2);
        cutForm(scene, form, pens, hatches);
      }
    },
    climbers: () => {
      for (const form of shown(picture().climbers)) {
        shadow(form, 0.25);
        cutForm(scene, form, pens, hatches);
      }
    },
    overWalls: () => {
      for (const form of shown(picture().climbers)) cutForm(scene, form, pens, hatches, 0.8);
    },
    columns: () => {
      for (const form of shown(picture().columns)) {
        shadow(form, 0.2);
        cutForm(scene, form, pens, hatches);
      }
    },
  };
}
