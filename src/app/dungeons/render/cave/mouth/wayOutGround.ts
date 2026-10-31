/**
 * The trodden ground of a cave's ways out, one drawing per painter, under the cave's floor (which
 * covers the sliver it overlaps inside the mouth). Stone & shadow lays the floor's own colour and
 * rock grain out over the paper and lets it thin away; Engraved lets the floor's paper thin away
 * into a stipple that grows sparse with the ground. The scree that ends the walls lies over both.
 */

import { layerOf, type ArtScene } from '../../art/artScene';
import { hash2, valueNoise } from '../../art/noise';
import { grown, polyPath, runsPath } from '../../art/paths';
import { drawGridCanvas, fieldOf, gridOver, rgbaCanvas } from '../../art/raster';
import { paintLayer } from '../../art/strips';
import type { Pens } from '../../engraved/pens';
import { engravedHand } from '../../engraved/hand';
import { pointsBounds, type Bounds, type Canvas2D, type Vec } from '../../geometry';
import { withAlpha } from '../../palette';
import type { StoneColours } from '../../stone/colours';
import { stoneHand } from '../../stone/hand';
import { drawMouthScree } from './mouthScree';
import { groundDistance, groundRing, wayCentre, wayHalf, wayPoint, wayStrength, type WayOut } from './wayOut';

/** The faintest ground drawn: its ring bounds every drawing of the way. */
const FAINTEST = 0.02;
/** Where no picture can be drawn (the SVG export), the fade in steps: each level's ring filled at `STEP_ALPHA`. */
const STEPS = [0.1, 0.35, 0.6, 0.85];
const STEP_ALPHA = 0.4;

/** A way out's trodden ground: how strongly it shows at a point (1 at the mouth, 0 past its end) and where it can. */
export interface WayGround {
  way: WayOut;
  strength: (p: Vec) => number;
  bounds: Bounds;
}

/** The ring round all of a way out's ground, out to where it fades to nothing. */
export function wayGroundRing(scene: ArtScene, way: WayOut): Vec[] {
  return groundRing(scene.env.dungeon.field, way, FAINTEST);
}

/** The ground of every way out of the floor on show. */
export function groundsOf(scene: ArtScene): WayGround[] {
  const { dungeon } = scene.env;
  const distance = groundDistance(dungeon.field);
  return dungeon.ways.map((way) => ({
    way,
    strength: (p: Vec) => wayStrength(way, p, distance),
    bounds: grown(pointsBounds(wayGroundRing(scene, way)), 0.05),
  }));
}

/**
 * Lays what `painter` draws over the ground's bounds onto the map through the ground's fade: whole
 * at the mouth, gone at its far end. Without pictures, the fade's rings in steps of the colour.
 */
function throughFade(scene: ArtScene, ground: WayGround, colour: string, painter?: (layer: Canvas2D) => void): void {
  const { ctx, dungeon } = scene.env;
  if (!scene.raster) {
    ctx.save();
    ctx.fillStyle = withAlpha(colour, STEP_ALPHA);
    for (const level of STEPS) {
      ctx.beginPath();
      polyPath(groundRing(dungeon.field, ground.way, level))(ctx);
      ctx.fill();
    }
    ctx.restore();
    return;
  }
  const { bounds } = ground;
  const g = gridOver(bounds.minX, bounds.minY, bounds.maxX, bounds.maxY, scene.grid.res);
  const fade = rgbaCanvas(g, [0, 0, 0], fieldOf(g, (x, y) => ground.strength({ x, y })));
  paintLayer(layerOf(scene), 'source-over', (layer) => {
    layer.fillStyle = colour;
    layer.fillRect(bounds.minX, bounds.minY, bounds.maxX - bounds.minX, bounds.maxY - bounds.minY);
    painter?.(layer);
    layer.globalAlpha = 1;
    layer.globalCompositeOperation = 'destination-in';
    drawGridCanvas(layer, g, fade);
  }, bounds);
}

/** Worn runs along the way, where feet have gone: broken, wandering, out to most of its length. */
function wornRuns(way: WayOut): Vec[][] {
  const runs: Vec[][] = [];
  for (let k = 0; k < 4; k++) {
    const share = (hash2(k, 7, way.seed) - 0.5) * 1.2;
    const start = 0.15 + hash2(k, 8, way.seed) * 0.5;
    const end = way.length * (0.45 + hash2(k, 9, way.seed) * 0.3);
    let run: Vec[] = [];
    for (let u = start; u <= end; u += 0.08) {
      if (valueNoise(u * 2.2, k * 5.3, way.seed + 2) < 0.38) {
        if (run.length > 1) runs.push(run);
        run = [];
        continue;
      }
      const side = share < 0 ? -1 : 1;
      const drift = (valueNoise(u * 1.3, k * 3.1, way.seed + 3) - 0.5) * 0.18;
      run.push(wayPoint(way, u, wayCentre(way, u) + share * wayHalf(way, u, side) * 0.7 + drift));
    }
    if (run.length > 1) runs.push(run);
  }
  return runs;
}

/** Grit on the way: candidate points on a jittered lattice of `spacing` cells, each kept by `keep` of its strength. */
function grit(ground: WayGround, spacing: number, keep: (strength: number, roll: number) => boolean): Vec[] {
  const { bounds, way } = ground;
  const out: Vec[] = [];
  for (let j = Math.floor(bounds.minY / spacing); j <= bounds.maxY / spacing; j++) {
    for (let i = Math.floor(bounds.minX / spacing); i <= bounds.maxX / spacing; i++) {
      const p = { x: (i + hash2(i, j, way.seed + 11)) * spacing, y: (j + hash2(i, j, way.seed + 12)) * spacing };
      const s = ground.strength(p);
      if (s > 0 && keep(s, hash2(i, j, way.seed + 13))) out.push(p);
    }
  }
  return out;
}

function dots(ctx: Canvas2D, points: readonly Vec[], radius: (p: Vec) => number): void {
  ctx.beginPath();
  for (const p of points) {
    const r = radius(p);
    ctx.moveTo(p.x + r, p.y);
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
  }
  ctx.fill();
}

export function stoneWayOut(scene: ArtScene, c: StoneColours): void {
  const grounds = groundsOf(scene);
  if (!grounds.length) return;
  for (const ground of grounds) {
    // Worked out once: the layer is painted strip by strip.
    const runs = wornRuns(ground.way);
    const specks = grit(ground, 0.16, (_, roll) => roll < 0.35);
    throughFade(scene, ground, c.floor, (layer) => {
      layer.beginPath();
      runsPath(runs)(layer);
      layer.strokeStyle = withAlpha(c.line, c.dark ? 0.16 : 0.14);
      layer.lineWidth = 0.008;
      layer.lineCap = 'round';
      layer.lineJoin = 'round';
      layer.stroke();
      layer.fillStyle = withAlpha(c.dark ? '#000000' : c.line, 0.22);
      dots(layer, specks, (p) => 0.01 + hash2(Math.round(p.x * 97), Math.round(p.y * 97), 5) * 0.014);
    });
  }
  drawMouthScree(stoneHand(scene, c), grounds.map((g) => g.way));
}

export function engravedWayOut(scene: ArtScene, pens: Pens): void {
  const grounds = groundsOf(scene);
  if (!grounds.length) return;
  const { ctx } = scene.env;
  for (const ground of grounds) {
    throughFade(scene, ground, pens.floor);
    ctx.save();
    ctx.beginPath();
    runsPath(wornRuns(ground.way))(ctx);
    ctx.strokeStyle = withAlpha(pens.ink, 0.16);
    ctx.lineWidth = 0.009;
    ctx.lineCap = 'round';
    ctx.stroke();
    // The stipple is thickest where the ground thins and sparse where it is nearly gone, so the paper takes it over.
    ctx.fillStyle = pens.ink;
    const spacing = Math.max(0.07, pens.spacing * 1.6);
    dots(ctx, grit(ground, spacing, (s, roll) => roll < 2.4 * s * (1 - s) ** 2), (p) => Math.max(pens.minWidth, 0.007 + hash2(Math.round(p.x * 97), Math.round(p.y * 97), 6) * 0.006));
    ctx.restore();
  }
  drawMouthScree(engravedHand(scene, pens), grounds.map((g) => g.way));
}
