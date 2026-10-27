import type { ArtScene } from '../../art/artScene';
import { TO_LIGHT } from '../../art/light';
import { valueNoise } from '../../art/noise';
import { clipOutsideMouths, grownRings, rockSide, traceRings, traceWallInk } from '../../art/outline';
import { runsPath } from '../../art/paths';
import type { Pens } from '../../engraved/pens';
import type { Vec } from '../../geometry';
import { withAlpha } from '../../palette';
import type { StoneColours } from '../../stone/colours';
import { FacetBatch, rockTones } from '../../stone/rockFacets';
import { lipChips } from './lipChips';
import { wallInkWidth } from '../../wallInk';

interface Lip {
  outer: Vec[][];
  light: Vec[][];
  shade: Vec[][];
  ledges: Vec[][];
  hachures: Vec[][];
}

const LIP = { least: 0.08, more: 0.12 };
/** How far the rock lip and its strokes reach past the floor's edge at most, in cells. */
const LIP_REACH = LIP.least + LIP.more + 0.02;
/** How far an engraved cave's lip lines and wall ink reach past the floor's edge, in cells. */
const ENGRAVED_REACH = 0.23;

function lipWidth(p: Vec, seed: number): number {
  return LIP.least + valueNoise(p.x * 2.1, p.y * 2.1, seed + 21) * LIP.more;
}

/** A varying rock lip outside the unchanged floor boundary; no dressed blocks or radial joints. */
function rockLip(scene: ArtScene): Lip {
  const seed = scene.env.dungeon.model.seed;
  const lip: Lip = { outer: [], light: [], shade: [], ledges: [], hachures: [] };
  for (const ring of scene.floorRings) {
    const normals = ring.map((a, i) => rockSide(scene, a, ring[(i + 1) % ring.length]!));
    const outer = ring.map((p, i) => {
      const a = normals[(i + ring.length - 1) % ring.length]!;
      const b = normals[i]!;
      const length = Math.hypot(a.x + b.x, a.y + b.y) || 1;
      const width = lipWidth(p, seed);
      return { x: p.x + (a.x + b.x) / length * width, y: p.y + (a.y + b.y) / length * width };
    });
    lip.outer.push(outer);
    let untilHatch = 0;
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i]!;
      const b = ring[(i + 1) % ring.length]!;
      const n = normals[i]!;
      const face = -(n.x * TO_LIGHT.x + n.y * TO_LIGHT.y);
      const lightEdge = [a, b].map(p => ({ x: p.x + n.x * 0.045, y: p.y + n.y * 0.045 }));
      if (face > 0.2) lip.light.push(lightEdge);
      else if (face < -0.2) lip.shade.push(lightEdge);
      if (valueNoise(a.x * 3, a.y * 3, seed + 22) > 0.3) lip.ledges.push([outer[i]!, outer[(i + 1) % ring.length]!]);
      const length = Math.hypot(b.x - a.x, b.y - a.y);
      for (; untilHatch < length; untilHatch += 0.13) {
        if (face > -0.15) continue;
        const t = untilHatch / length;
        const p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
        const width = lipWidth(p, seed);
        lip.hachures.push([{ x: p.x + n.x * 0.055, y: p.y + n.y * 0.055 }, { x: p.x + n.x * width + n.y * 0.025, y: p.y + n.y * width - n.x * 0.025 }]);
      }
      untilHatch -= length;
    }
  }
  return lip;
}

function stroke(scene: ArtScene, runs: Vec[][], colour: string, width: number): void {
  const { ctx } = scene.env;
  ctx.beginPath();
  runsPath(runs)(ctx);
  ctx.strokeStyle = colour;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();
}

export function stoneEdge(scene: ArtScene, c: StoneColours): void {
  const { ctx } = scene.env;
  const lip = rockLip(scene);
  ctx.save();
  clipOutsideMouths(scene, LIP_REACH);
  ctx.beginPath();
  traceRings(ctx, lip.outer);
  traceRings(ctx, scene.floorRings);
  ctx.clip('evenodd');
  if (scene.raster) drawChips(scene, c, lip);
  else {
    ctx.fillStyle = c.rock;
    ctx.fill('evenodd');
  }
  stroke(scene, lip.light, withAlpha(c.light, c.dark ? 0.22 : 0.55), 0.018);
  stroke(scene, lip.shade, withAlpha('#000000', 0.3), 0.022);
  stroke(scene, lip.ledges, withAlpha(c.line, 0.3), 0.007);
  ctx.restore();
  // paintStone draws the shared wall ink after the shade and grid, exactly on the scene's walls.
}

/** The lip as chips of flat facets on a bed of the rock's darkest tone, which shows in the cracks between them. */
function drawChips(scene: ArtScene, c: StoneColours, lip: Lip): void {
  const { ctx } = scene.env;
  const tones = rockTones(c);
  ctx.fillStyle = tones[0]!;
  ctx.fill('evenodd');
  const batch = new FacetBatch(tones);
  const cracks: Vec[][] = [];
  scene.floorRings.forEach((ring, r) => {
    for (const chip of lipChips(ring, lip.outer[r]!, scene.env.dungeon.model.seed + r * 7)) {
      for (const { face, light } of chip.facets) batch.add(face, light, 8);
      cracks.push(chip.crack);
    }
  });
  batch.fill(ctx);
  stroke(scene, cracks, withAlpha(c.dark ? '#000000' : c.line, 0.45), 0.008);
}

export function engravedEdge(scene: ArtScene, pens: Pens): void {
  const { ctx, style } = scene.env;
  const lip = rockLip(scene);
  const width = wallInkWidth(style);
  ctx.save();
  clipOutsideMouths(scene, ENGRAVED_REACH);
  ctx.beginPath();
  traceRings(ctx, grownRings(scene, ENGRAVED_REACH));
  traceRings(ctx, scene.floorRings);
  ctx.clip('evenodd');
  stroke(scene, lip.ledges, withAlpha(pens.ink, 0.65), 0.009);
  stroke(scene, lip.hachures, withAlpha(pens.ink, 0.5), 0.009);
  ctx.beginPath();
  traceWallInk(ctx, scene, width);
  ctx.strokeStyle = pens.ink;
  ctx.stroke();
  ctx.restore();
}
