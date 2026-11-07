import { unionRings } from '../clipShapes';
import { shapeRings, type FloorShape, type Vec } from '../geometry';
import { filledPockets } from '../pockets';
import type { RenderEnv } from '../renderEnv';
import { rasterRelief, type Stand } from './heights';
import { openGround } from '../grounds/groundsShapes';
import { SHADOW_DIR, WALL_SHADOW } from './light';
import { blurField, fieldOf, gridOver, sampleField, type Grid } from './raster';
import type { LayerTarget } from './strips';

/** The part of the map a picture shows: from the corner of `originCell`, so many pixels. */
export interface ArtFrame {
  originCell: Vec;
  widthPx: number;
  heightPx: number;
  pxPerCell: number;
}

/**
 * Everything a direction draws from: the floors, the outline of their union, and soft fields over
 * the frame (signed distance to the floors, the height of what stands, the shadow the one light
 * casts from it and the occlusion at its foot), worked out once.
 */
export interface ArtScene {
  env: RenderEnv;
  frame: ArtFrame;
  /** The floors with a narrow opening's jambs: the walls' edge follows exactly these. */
  floors: readonly FloorShape[];
  /** The outline of the union of the floors, as rings. */
  floorRings: Vec[][];
  grid: Grid;
  heights: Float32Array;
  pocket: Float32Array;
  /** 0..1, how deep in the shadow of what stands a point lies. */
  shadow: Float32Array;
  /** 0..1, how much higher the surroundings stand than a point: ambient occlusion. */
  occlusion: Float32Array;
  dark: boolean;
  /** Whether the context draws pictures (a canvas does; the SVG recorder does not). */
  raster: boolean;
  sdfAt(x: number, y: number): number;
  shadowAt(x: number, y: number): number;
  occlusionAt(x: number, y: number): number;
  pocketAt(x: number, y: number): number;
}

/** Samples per cell of the soft fields, by how large a cell is drawn. */
function fieldResolution(pxPerCell: number): number {
  return Math.round(Math.max(8, Math.min(36, pxPerCell / 6)));
}

/** Whether `ctx` can draw images and patterns: a canvas can, the SVG recorder cannot. */
export function drawsRaster(ctx: object): boolean {
  const c = ctx as Partial<Record<'drawImage' | 'createPattern' | 'getImageData', unknown>>;
  return typeof OffscreenCanvas !== 'undefined' && typeof c.drawImage === 'function' && typeof c.createPattern === 'function';
}

/** The visible cells, with a margin. */
export function viewBounds(frame: ArtFrame, margin = 0.5): { minX: number; minY: number; maxX: number; maxY: number } {
  const { originCell, widthPx, heightPx, pxPerCell } = frame;
  return { minX: originCell.x - margin, minY: originCell.y - margin, maxX: originCell.x + widthPx / pxPerCell + margin, maxY: originCell.y + heightPx / pxPerCell + margin };
}

export function buildArtScene(env: RenderEnv, frame: ArtFrame, stands: readonly Stand[], dark: boolean, pictures = true): ArtScene {
  const { dungeon } = env;
  const floors = dungeon.floors;
  const floorRings = unionRings(floors.flatMap(shape => shapeRings(shape, 0, frame.pxPerCell)));
  const res = fieldResolution(frame.pxPerCell);
  const b = viewBounds(frame, 1);
  const grid = gridOver(b.minX, b.minY, b.maxX, b.maxY, res);
  // Distance is piecewise smooth: half the samples, read bilinearly, are as good and twice as quick.
  const sdfGrid = gridOver(b.minX, b.minY, b.maxX, b.maxY, res / 2);
  const sdf = fieldOf(sdfGrid, (x, y) => dungeon.field.distance(x, y));
  const pockets = filledPockets(dungeon, env.style.surround.reach).map(p => p.ring);
  // The ground before a way in is open, not rock: no wall's shadow falls across a mouth.
  const open = dungeon.open;
  // A house's grounds are open ground, as low as its floors, where its walls' and the garden's shadows fall.
  const relief = rasterRelief(grid, floors, open, pockets, stands, (x, y) => dungeon.field.distance(x, y) > 0, openGround(dungeon.floor));
  const shadow = env.view.shadow ? castShadow(grid, relief.heights) : new Float32Array(relief.heights.length);
  const occlusion = occlusionOf(grid, relief.heights);
  return {
    env,
    frame,
    floors,
    floorRings,
    grid,
    heights: relief.heights,
    pocket: relief.pocket,
    shadow,
    occlusion,
    dark,
    raster: pictures && drawsRaster(env.ctx),
    sdfAt: (x, y) => sampleField(sdfGrid, sdf, x, y),
    shadowAt: (x, y) => sampleField(grid, shadow, x, y),
    occlusionAt: (x, y) => sampleField(grid, occlusion, x, y),
    pocketAt: (x, y) => sampleField(grid, relief.pocket, x, y),
  };
}

/** How much higher, on average, the surroundings stand than each point (0 on a top or in the open). */
function occlusionOf(grid: Grid, heights: Float32Array): Float32Array {
  const around = blurField(grid, heights, grid.res * 0.08, 3);
  return around.map((h, k) => Math.max(0, h - heights[k]!));
}

/**
 * The shadow everything standing casts towards `SHADOW_DIR` onto what is lower: as long as the
 * difference in height times a wall's shadow, its penumbra widening with distance from what casts it.
 */
function castShadow(grid: Grid, heights: Float32Array): Float32Array {
  const { w, h, res } = grid;
  const out = new Float32Array(w * h);
  const steps = Math.ceil(WALL_SHADOW * 1.35 * res);
  const dx = -SHADOW_DIR.x;
  const dy = -SHADOW_DIR.y;
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const k = j * w + i;
      const own = heights[k]!;
      if (own > 0.98) continue;
      let s = 0;
      for (let step = 1; step <= steps; step++) {
        const qi = Math.round(i + dx * step);
        const qj = Math.round(j + dy * step);
        if (qi < 0 || qj < 0 || qi >= w || qj >= h) break;
        const reach = (heights[qj * w + qi]! - own) * WALL_SHADOW;
        if (reach <= 0) continue;
        const t = step / res;
        s = Math.max(s, Math.min(1, (reach - t) / (0.03 + 0.35 * t) + 0.5));
        if (s >= 1) break;
      }
      out[k] = s;
    }
  }
  return blurField(grid, out, Math.max(1, res * 0.025), 2);
}

/** The picture a layer of the scene is painted over. */
export function layerOf(scene: ArtScene): LayerTarget {
  return { ctx: scene.env.ctx, widthPx: scene.frame.widthPx, heightPx: scene.frame.heightPx };
}
