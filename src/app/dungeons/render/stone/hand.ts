import { mixColours, parseHex, withAlpha } from '../palette';
import { layerOf, type ArtScene } from '../art/artScene';
import type { Hand, Material, PileStone, Weight } from '../art/hand';
import { shadeEdges, TO_LIGHT } from '../art/light';
import { polysPath, runsPath } from '../art/paths';
import { drawGridCanvas, fieldOf, gridOver, rgbaCanvas } from '../art/raster';
import { paintLayer } from '../art/strips';
import type { Vec } from '../geometry';
import type { StoneColours } from './colours';
import { drawLava } from './lava';
import { cellPattern } from './patterns';
import { grainTile, rockTile, tileTexels, woodTile, ROCK_TILE } from './textures';
import { paintWater } from './water';
import { lightInside } from './lightInside';
import { paintPile } from './pile';
import { depthField } from '../art/pools';

/** Acid: a murky, poisonous green. */

/** Line weights of Stone & shadow, in cells. */
const WEIGHTS = { heavy: 0.028, outline: 0.013, fine: 0.007 };
/** How strongly the rock grain lies on a dark look's rock. */
const DARK_ROCK_GRAIN = 0.65;

/** The colour of a material in the look. */
export function materialColour(c: StoneColours, material: Material): string {
  switch (material) {
    case 'wood':
      return c.wood;
    case 'rope':
      return mixColours(c.wood, c.mono ? c.floor : '#cdb88e', 0.5);
    case 'floor':
      return c.floor;
    case 'raised':
      return c.raised;
    case 'rock':
      return c.rock;
    case 'dressed':
      return c.band;
    case 'metal':
      return c.metal;
    case 'cloth':
      return c.cloth;
    case 'glass':
      return c.mono ? mixColours(c.floor, c.line, 0.06) : mixColours(c.water, c.light, c.dark ? 0.12 : 0.5);
    default:
      return c.stone;
  }
}

/** Stone & shadow's hand: textured materials, tone as soft shade, edges lit where they face the light. */
export function stoneHand(scene: ArtScene, c: StoneColours): Hand {
  const { ctx } = scene.env;
  const hand: Hand = {
    scene,
    tone: (field, bounds, clip, kind) => {
      if (!scene.raster) return;
      const g = gridOver(bounds.minX, bounds.minY, bounds.maxX, bounds.maxY, scene.grid.res);
      const deep = kind === 'depth';
      const alpha = fieldOf(g, (x, y) => Math.min(1, field(x, y)) * (deep ? 1 : 0.8));
      const canvas = rgbaCanvas(g, parseHex(deep ? '#000000' : c.shadow), alpha);
      paintLayer(layerOf(scene), deep || c.dark ? 'source-over' : 'multiply', layer => {
        if (clip) {
          layer.beginPath();
          clip(layer);
          layer.clip();
        }
        drawGridCanvas(layer, g, canvas);
      }, bounds);
    },
    surface: (path, material) => {
      hand.fill(path, material);
      hand.grain(path, material);
    },
    fill: (path, material) => {
      ctx.save();
      ctx.beginPath();
      path(ctx);
      ctx.fillStyle = materialColour(c, material);
      ctx.fill();
      ctx.restore();
    },
    grain: (path, material) => {
      if (!scene.raster || material === 'glass') return;
      ctx.save();
      ctx.beginPath();
      path(ctx);
      ctx.clip();
      if (material === 'rock') {
        ctx.fillStyle = cellPattern(ctx, rockTile(), ROCK_TILE.cells);
        // A dark look's rock lies a few steps above its paper: its shaded facets, as deep, would read as holes.
        if (c.dark) ctx.globalAlpha *= DARK_ROCK_GRAIN;
      }
      else if (material === 'wood' || material === 'rope') ctx.fillStyle = cellPattern(ctx, woodTile(0.12, tileTexels(0.9)), 0.9);
      else ctx.fillStyle = cellPattern(ctx, grainTile(material === 'metal' ? 0.03 : 0.06, tileTexels(1.4)), 1.4);
      ctx.fill();
      ctx.restore();
    },
    paint: material => {
      const fill = materialColour(c, material);
      return { fill, ink: c.dark ? mixColours(fill, '#000000', 0.65) : mixColours(fill, c.line, 0.78) };
    },
    weight: weight => WEIGHTS[weight],
    line: (runs, weight, closed) => {
      ctx.save();
      ctx.beginPath();
      runsPath(runs, closed)(ctx);
      ctx.strokeStyle = weight === 'fine' ? withAlpha(c.dark ? '#000000' : c.line, c.dark ? 0.55 : 0.55) : c.dark && weight !== 'heavy' ? mixColours(c.line, c.floor, 0.35) : c.line;
      ctx.lineWidth = WEIGHTS[weight];
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.stroke();
      ctx.restore();
    },
    edges: (poly, raised) => edges(scene, c, poly, raised),
    // A vector picture keeps each caller's plain stones.
    ...(scene.raster ? { pile: (stones: readonly PileStone[], weight: (stone: PileStone) => Weight) => paintPile(scene, hand, c, stones, weight) } : {}),
    solid: (path, centre, radius, strength = 1) => {
      if (!scene.raster) return;
      ctx.save();
      ctx.beginPath();
      path(ctx);
      ctx.clip();
      lightInside(ctx, c, centre, radius, strength);
      ctx.restore();
    },
    water: (pools, depth, deep) => paintWater(scene, c, polysPath(pools), pools, depth, deep),
    lava: (pools, tint) => (c.mono && tint === 'acid' ? paintWater(scene, c, polysPath(pools), pools, depthField(scene, polysPath(pools), pools.flat()), true) : drawLava(scene, c, pools, polysPath(pools), tint)),
  };
  return hand;
}

/** A polygon's rim: the lip towards the light catches it, the other falls into shade, then an outline. */
function edges(scene: ArtScene, c: StoneColours, poly: readonly Vec[], raised: boolean): void {
  const { ctx } = scene.env;
  const lit = shadeEdges(poly, !raised, 0.2);
  const dark = shadeEdges(poly, raised, 0.2);
  const inward = raised ? 1 : -1;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const stroke = (runs: Vec[][], colour: string, width: number, offset: number): void => {
    ctx.beginPath();
    runsPath(runs.map(run => run.map(p => ({ x: p.x + TO_LIGHT.x * -offset, y: p.y + TO_LIGHT.y * -offset }))))(ctx);
    ctx.strokeStyle = colour;
    ctx.lineWidth = width;
    ctx.stroke();
  };
  stroke(lit, withAlpha(c.light, c.dark ? 0.22 : 0.6), 0.016, 0.01 * inward);
  stroke(dark, withAlpha('#000000', 0.32), 0.02, -0.01 * inward);
  ctx.beginPath();
  runsPath([poly], true)(ctx);
  ctx.strokeStyle = c.dark ? mixColours(c.line, c.floor, 0.3) : c.line;
  ctx.lineWidth = WEIGHTS.outline;
  ctx.stroke();
  ctx.restore();
}
