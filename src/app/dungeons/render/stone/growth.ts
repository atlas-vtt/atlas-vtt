import { layerOf, viewBounds, type ArtScene } from '../art/artScene';
import { castShadow, type Hand } from '../art/hand';
import { TO_LIGHT } from '../art/light';
import { grownRings, traceRings } from '../art/outline';
import { drawGridCanvas, pixelCanvas, rgbaCanvas } from '../art/raster';
import { paintLayer } from '../art/strips';
import { poolOutlines, poolsPath } from '../art/pools';
import type { Canvas2D, Vec } from '../geometry';
import { inView, type Leaf, type PlantForm } from '../growth/forms';
import { growthPicture } from '../growth/growthForms';
import { placeLeaf, plainLeaves, silhouette, stemRibbon } from '../growth/leafGeometry';
import { mossField, mossResolution } from '../growth/mossField';
import { stoneColours, type StoneColours } from './colours';
import type { Rgb } from '../palette';
import { css, plantColours, rampAt, type PlantColours, type Ramp } from './plantColours';
import { BAND } from './walls';

/**
 * Stone & shadow's plants, painted: every leaf in two halves, the one turned to the light lighter,
 * its tone from how deep in its plant it lies (lower leaves sit in the shade of upper ones), a fine
 * darker edge and a pale rib; stems as tapering ribbons; blossoms petal by petal; fungus caps domed
 * by the light; moss as velvet. What stands casts a soft shadow from its height.
 */

function polygon(ctx: Canvas2D, points: readonly Vec[]): void {
  ctx.moveTo(points[0]!.x, points[0]!.y);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i]!.x, points[i]!.y);
  ctx.closePath();
}

/** A point of a ramp drawn `share` of the way towards `towards`. */
function mixed(ramp: Ramp, t: number, towards: Rgb, share: number): string {
  const k = Math.max(0, Math.min(1, t));
  const [a, b] = k < 0.5 ? [ramp[0], ramp[1]] : [ramp[1], ramp[2]];
  const f = k < 0.5 ? k * 2 : k * 2 - 1;
  const at = (i: 0 | 1 | 2): number => Math.round(a[i] + (b[i] - a[i]) * f + (towards[i] - (a[i] + (b[i] - a[i]) * f)) * share);
  return css([at(0), at(1), at(2)]);
}

function paintLeaf(ctx: Canvas2D, leaf: Leaf, colours: PlantColours, ramp: Ramp, line: number): void {
  const placed = placeLeaf(leaf);
  const depth = 0.2 + 0.62 * leaf.layer + leaf.tone * 0.09;
  const turn = placed.facing * 0.17;
  // A few old leaves of brambles and dead creepers have turned.
  const turned = (leaf.shape === 'ovate' || leaf.shape === 'withered') && leaf.lobes > 0.82 ? (leaf.lobes - 0.82) * 3.5 : 0;
  ctx.beginPath();
  polygon(ctx, placed.left);
  ctx.fillStyle = turned ? mixed(ramp, depth + turn, colours.autumn, turned) : rampAt(ramp, depth + turn);
  ctx.fill();
  ctx.beginPath();
  polygon(ctx, placed.right);
  ctx.fillStyle = turned ? mixed(ramp, depth - turn, colours.autumn, turned) : rampAt(ramp, depth - turn);
  ctx.fill();
  ctx.beginPath();
  polygon(ctx, placed.left);
  polygon(ctx, placed.right);
  ctx.strokeStyle = css(colours.edge, colours.dark ? 0.5 : 0.32 + 0.2 * (1 - leaf.layer));
  ctx.lineWidth = line;
  ctx.stroke();
  if (leaf.shape === 'blade' || leaf.length < line * 14) return;
  ctx.beginPath();
  for (const run of [placed.rib, ...placed.veins]) {
    ctx.moveTo(run[0]!.x, run[0]!.y);
    for (let i = 1; i < run.length; i++) ctx.lineTo(run[i]!.x, run[i]!.y);
  }
  ctx.strokeStyle = css(colours.vein, (colours.dark ? 0.18 : 0.34) * (0.5 + 0.5 * leaf.layer));
  ctx.lineWidth = line * 0.8;
  ctx.stroke();
}

function paintStems(ctx: Canvas2D, form: PlantForm, colours: PlantColours, line: number, plain = false): void {
  const base = colours.stems[form.palette];
  const woody = form.palette === 'root';
  for (const stem of form.stems) {
    if (plain && stem.from < 0.02) continue;
    ctx.beginPath();
    polygon(ctx, stemRibbon(stem));
    if (woody) {
      ctx.strokeStyle = css(colours.edge, colours.dark ? 0.7 : 0.55);
      ctx.lineWidth = line * 1.3;
      ctx.stroke();
    }
    ctx.fillStyle = css(base);
    ctx.fill();
    if (stem.from < 0.012 || plain) continue;
    if (woody) {
      // Bark: the root's underside falls into shade along its length.
      ctx.beginPath();
      const shade = stem.points.map(p => ({ x: p.x - TO_LIGHT.x * stem.from * 0.22, y: p.y - TO_LIGHT.y * stem.from * 0.22 }));
      ctx.moveTo(shade[0]!.x, shade[0]!.y);
      for (const p of shade) ctx.lineTo(p.x, p.y);
      ctx.strokeStyle = css(colours.leaves.root[0], 0.6);
      ctx.lineWidth = stem.from * 0.4;
      ctx.lineCap = 'round';
      ctx.stroke();
    }
    // A rounded stem or root catches the light along its lit side.
    ctx.beginPath();
    const lit = stem.points.map(p => ({ x: p.x + TO_LIGHT.x * stem.from * 0.22, y: p.y + TO_LIGHT.y * stem.from * 0.22 }));
    ctx.moveTo(lit[0]!.x, lit[0]!.y);
    for (const p of lit) ctx.lineTo(p.x, p.y);
    ctx.strokeStyle = css(colours.leaves[form.palette][2], colours.dark ? 0.2 : 0.45);
    ctx.lineWidth = stem.from * 0.3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
  }
}

/** Where a root breaks the floor: a dark gap, deepest in its middle. */
function paintHoles(ctx: Canvas2D, form: PlantForm, colours: PlantColours, raster: boolean): void {
  for (const hole of form.holes) {
    if (!raster) {
      ctx.beginPath();
      ctx.ellipse(hole.x, hole.y, hole.radius * 0.8, hole.radius * 0.55, hole.angle, 0, Math.PI * 2);
      ctx.fillStyle = css(colours.hole, 0.7);
      ctx.fill();
      continue;
    }
    const g = ctx.createRadialGradient(hole.x, hole.y, 0, hole.x, hole.y, hole.radius * 1.1);
    g.addColorStop(0, css(colours.hole, 0.85));
    g.addColorStop(0.6, css(colours.hole, 0.6));
    g.addColorStop(1, css(colours.hole, 0));
    ctx.beginPath();
    ctx.ellipse(hole.x, hole.y, hole.radius * 1.1, hole.radius * 0.75, hole.angle, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();
  }
}

/** A cane's thorns: small hooks along it, either side by turns. */
function paintThorns(ctx: Canvas2D, form: PlantForm, colours: PlantColours): void {
  ctx.beginPath();
  for (const stem of form.stems) {
    if (!stem.thorns) continue;
    const { points } = stem;
    for (let i = 2; i < points.length - 1; i += 2) {
      const a = points[i - 1]!;
      const b = points[i]!;
      const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const t = { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
      const side = i % 4 === 0 ? 1 : -1;
      const n = { x: -t.y * side, y: t.x * side };
      const w = stem.from * 0.5;
      ctx.moveTo(b.x - t.x * w, b.y - t.y * w);
      ctx.lineTo(b.x + n.x * w * 2.2 + t.x * w * 1.2, b.y + n.y * w * 2.2 + t.y * w * 1.2);
      ctx.lineTo(b.x + t.x * w, b.y + t.y * w);
      ctx.closePath();
    }
  }
  ctx.fillStyle = css(colours.stems[form.palette].map(v => v * 0.6) as [number, number, number]);
  ctx.fill();
}

function paintBlossoms(ctx: Canvas2D, form: PlantForm, colours: PlantColours): void {
  for (const b of form.blossoms) {
    const petal = colours.petals[Math.abs(Math.round(b.tone * 10)) % colours.petals.length]!;
    for (let k = 0; k < b.petals; k++) {
      const a = b.angle + (k * Math.PI * 2) / b.petals;
      const cx = b.x + Math.cos(a) * b.radius * 0.55;
      const cy = b.y + Math.sin(a) * b.radius * 0.55;
      const lit = Math.cos(a - Math.atan2(TO_LIGHT.y, TO_LIGHT.x));
      ctx.beginPath();
      ctx.ellipse(cx, cy, b.radius * 0.55, b.radius * 0.36, a, 0, Math.PI * 2);
      ctx.fillStyle = css(petal.map(v => Math.min(255, v * (0.9 + 0.1 * lit))) as [number, number, number]);
      ctx.fill();
      ctx.strokeStyle = css(colours.edge, 0.18);
      ctx.lineWidth = b.radius * 0.06;
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.radius * 0.22, 0, Math.PI * 2);
    ctx.fillStyle = css(colours.heart);
    ctx.fill();
  }
}

function paintCaps(ctx: Canvas2D, form: PlantForm, colours: PlantColours, raster: boolean): void {
  const ramp = colours.leaves.fungus;
  for (const cap of [...form.caps].sort((a, b) => a.layer - b.layer)) {
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(cap.x, cap.y, cap.radius * cap.stretch, cap.radius, cap.angle, 0, Math.PI * 2);
    ctx.fillStyle = rampAt(ramp, 0.45 + cap.tone * 0.08);
    ctx.fill();
    ctx.clip();
    const r = cap.radius;
    if (raster) {
      // The dome: light on the side towards it, shade falling away on the other.
      const g = ctx.createRadialGradient(cap.x + TO_LIGHT.x * r * 0.45, cap.y + TO_LIGHT.y * r * 0.45, r * 0.05, cap.x, cap.y, r * 1.3);
      g.addColorStop(0, rampAt(ramp, 1));
      g.addColorStop(0.55, rampAt(ramp, 0.55));
      g.addColorStop(1, rampAt(ramp, 0.05));
      ctx.fillStyle = g;
      ctx.fill();
    }
    // Its rim on the side away from the light, where the cap curls under towards its gills.
    ctx.beginPath();
    ctx.ellipse(cap.x, cap.y, cap.radius * cap.stretch, cap.radius, cap.angle, 0, Math.PI * 2);
    ctx.ellipse(cap.x + TO_LIGHT.x * r * 0.18, cap.y + TO_LIGHT.y * r * 0.18, cap.radius * cap.stretch * 0.92, cap.radius * 0.92, cap.angle, 0, Math.PI * 2);
    ctx.fillStyle = rampAt(ramp, 0.05, 0.75);
    ctx.fill('evenodd');
    // Its crown: a little darker, as most caps are at their middle.
    ctx.beginPath();
    ctx.ellipse(cap.x + TO_LIGHT.x * r * 0.08, cap.y + TO_LIGHT.y * r * 0.08, r * 0.32 * cap.stretch, r * 0.32, cap.angle, 0, Math.PI * 2);
    ctx.fillStyle = rampAt(ramp, 0.22 + cap.tone * 0.08, 0.55);
    ctx.fill();
    ctx.restore();
    ctx.beginPath();
    ctx.ellipse(cap.x, cap.y, cap.radius * cap.stretch, cap.radius, cap.angle, 0, Math.PI * 2);
    ctx.strokeStyle = css(colours.edge, colours.dark ? 0.5 : 0.35);
    ctx.lineWidth = Math.max(0.003, cap.radius * 0.08);
    ctx.stroke();
  }
}

/** A plant as a picture that records every path keeps it: its leaves in a few tones, one path each. */
function paintPlainForm(ctx: Canvas2D, form: PlantForm, colours: PlantColours, onlyAbove: number): void {
  const ramp = colours.leaves[form.palette];
  const tones = new Map<number, Vec[][]>();
  for (const { leaf, outline } of plainLeaves(form.leaves.filter(l => l.layer > onlyAbove))) {
    const tone = Math.round((0.2 + 0.62 * leaf.layer + leaf.tone * 0.09) * 4) / 4;
    tones.set(tone, [...(tones.get(tone) ?? []), outline]);
  }
  for (const [tone, outlines] of [...tones].sort((a, b) => a[0] - b[0])) {
    ctx.beginPath();
    for (const outline of outlines) polygon(ctx, outline);
    ctx.fillStyle = rampAt(ramp, tone);
    ctx.fill();
  }
}

/** A plant, bottom to top: its stems, its leaves from the deepest, its blossoms and caps. */
function paintForm(scene: ArtScene, form: PlantForm, colours: PlantColours, onlyAbove = -1): void {
  const { ctx } = scene.env;
  if (!scene.raster) {
    if (onlyAbove < 0) paintStems(ctx, form, colours, 0.004, true);
    paintPlainForm(ctx, form, colours, onlyAbove);
    return;
  }
  const line = Math.max(0.0028, 0.75 / scene.frame.pxPerCell);
  ctx.save();
  ctx.lineJoin = 'round';
  if (onlyAbove < 0) {
    paintHoles(ctx, form, colours, scene.raster);
    paintStems(ctx, form, colours, line);
    paintThorns(ctx, form, colours);
  }
  const ramp = colours.leaves[form.palette];
  const leaves = form.leaves.filter(l => l.layer > onlyAbove).sort((a, b) => a.layer - b.layer);
  for (const leaf of leaves) paintLeaf(ctx, leaf, colours, ramp, line);
  if (onlyAbove < 0) {
    paintBlossoms(ctx, form, colours);
    paintCaps(ctx, form, colours, scene.raster);
  }
  ctx.restore();
}

function shadowOf(hand: Hand, form: PlantForm, strength: number): void {
  if (!hand.scene.raster) return;
  castShadow(hand, silhouette(form), form.lift, form.bounds, strength);
}

function shown(scene: ArtScene, forms: readonly PlantForm[]): PlantForm[] {
  const view = viewBounds(scene.frame, 1);
  return forms.filter(form => inView(form, view));
}

/** Moss on the floor and the wall's course, as velvet: cushions lit from above, deeper between. */
function paintMoss(scene: ArtScene, colours: PlantColours): void {
  if (!scene.raster) return;
  const { env } = scene;
  const view = viewBounds(scene.frame, 1);
  const res = mossResolution(scene.frame.pxPerCell);
  const seed = env.dungeon.model.seed;
  for (const cluster of growthPicture(env).moss) {
    if (!cluster.some(s => s.x + s.radius > view.minX && s.x - s.radius < view.maxX && s.y + s.radius > view.minY && s.y - s.radius < view.maxY)) continue;
    const field = mossField(cluster, res, seed);
    if (!field) continue;
    const { grid, cover, light } = field;
    const [d, m, l] = colours.moss;
    // Its own low shadow first, so the cushions stand on the floor.
    const under = rgbaCanvas(grid, colours.edge, cover.map(v => v * (colours.dark ? 0.5 : 0.3)));
    const offset = { ...grid, x0: grid.x0 + 0.014, y0: grid.y0 + 0.014 };
    const canvas = pixelCanvas(grid, (k, out, o) => {
      const t = light[k]!;
      const [a, b, f] = t < 0.5 ? [d, m, t * 2] : [m, l, t * 2 - 1];
      out[o] = a[0] + (b[0] - a[0]) * f;
      out[o + 1] = a[1] + (b[1] - a[1]) * f;
      out[o + 2] = a[2] + (b[2] - a[2]) * f;
      out[o + 3] = cover[k]! * 250;
    });
    paintLayer(layerOf(scene), 'source-over', layer => {
      // On the floor and the wall's course, never on the rock or the water.
      layer.beginPath();
      traceRings(layer, grownRings(scene, BAND));
      layer.clip();
      layer.beginPath();
      layer.rect(grid.x0, grid.y0, grid.w / grid.res, grid.h / grid.res);
      poolsPath(poolOutlines(scene))(layer);
      layer.clip('evenodd');
      drawGridCanvas(layer, offset, under);
      drawGridCanvas(layer, grid, canvas);
    }, { minX: grid.x0, minY: grid.y0, maxX: grid.x0 + grid.w / grid.res, maxY: grid.y0 + grid.h / grid.res });
  }
}

/** Each scene's plant colours, worked out once from its look (by the vegetation's painter, where it ran first). */
const sceneColours = new WeakMap<ArtScene, PlantColours>();

/**
 * Paints one plant form as Stone & shadow paints the vegetation, in the scene's colours: for a
 * piece drawn from the vegetation's forms (a cave's mushrooms), on a context already set to where
 * the form's cells lie.
 */
export function paintPlantForm(scene: ArtScene, form: PlantForm): void {
  let colours = sceneColours.get(scene);
  if (!colours) {
    colours = plantColours(stoneColours(scene.env.palette, scene.env.view.monochrome), scene.env.dungeon.model.seed);
    sceneColours.set(scene, colours);
  }
  paintForm(scene, form, colours);
  // A picture that records every path keeps the vegetation's leaves alone; a piece keeps its caps.
  if (!scene.raster) paintCaps(scene.env.ctx, form, colours, false);
}

export interface GrowthPainter {
  /** Moss and what grows on the floor: under the light and shade of the room. */
  ground(): void;
  /** Climbers on the walls, under the wall's ink line. */
  climbers(): void;
  /** The upper leaves of the climbers, over the wall's ink line, so it runs on under them. */
  overWalls(): void;
  /** Climbers round columns, over them. */
  columns(): void;
}

export function stoneGrowth(scene: ArtScene, hand: Hand, c: StoneColours): GrowthPainter {
  const colours = plantColours(c, scene.env.dungeon.model.seed);
  sceneColours.set(scene, colours);
  const picture = (): ReturnType<typeof growthPicture> => growthPicture(scene.env);
  return {
    ground: () => {
      paintMoss(scene, colours);
      for (const form of shown(scene, picture().ground)) {
        shadowOf(hand, form, 0.55);
        paintForm(scene, form, colours);
      }
    },
    climbers: () => {
      for (const form of shown(scene, picture().climbers)) {
        shadowOf(hand, form, 0.6);
        paintForm(scene, form, colours);
      }
    },
    overWalls: () => {
      for (const form of shown(scene, picture().climbers)) paintForm(scene, form, colours, 0.8);
    },
    columns: () => {
      for (const form of shown(scene, picture().columns)) {
        shadowOf(hand, form, 0.5);
        paintForm(scene, form, colours);
      }
    },
  };
}
