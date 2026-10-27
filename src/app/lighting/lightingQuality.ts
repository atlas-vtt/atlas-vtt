import { CELL_TEXELS, FLICKER_INTERVAL_MS, MAX_TEXELS, TILE_RAYS, worldTexel } from './lightingConstants';

/**
 * How much graphics memory and work the lighting may take on this device. Only the picture
 * changes: what tokens see, which light reaches them and what is remembered are worked out the
 * same way at every level, and walls hold light back at every level (a coarser texel makes
 * their capsules wider, `wallRadius`).
 */
export interface LightingQuality {
  /**
   * Longest side, in texels, of the textures the lighting keeps over the whole map (light map,
   * wall fields, darkness and zone maps). Maps up to twice this many pixels keep the finest
   * texel (`BASE_TEXEL`); larger ones get coarser texels, so memory stops growing with the map.
   */
  maxTexels: number;
  /** Light bounces off walls and floors on maps whose longer side is at most this many pixels; 0 never. */
  bounceMaxSide: number;
  /** Flickering lights are redrawn at most this often, in milliseconds; null keeps every light steady. */
  flickerMs: number | null;
  /**
   * Rays a light's tile traces across its flame where a texel sees only part of it (at most
   * `TILE_RAYS`): fewer make soft shadow edges coarser and a light's tile that much cheaper to
   * build. What a wall blocks is the same with any number.
   */
  tileRays: number;
  /**
   * Frames a second moving liquids are shown at, at most (`LiquidLayer`): each is a render of the
   * whole stage, the lighting's composite included.
   */
  liquidFps: number;
  /**
   * Device pixels per screen pixel the composite is worked out at, at most; unset, the render's
   * own (2 on a Retina display). Below the render's, it is worked out on fewer pixels and drawn
   * up to the render's (`CompositeUpscale`), where darkness wins at every edge: the map and the
   * tokens are softer, and what players see never reaches further.
   */
  compositePixelRatio?: number;
}

export const LIGHTING_QUALITY_LEVELS = ['high', 'balanced', 'saver'] as const;
export type LightingQualityLevel = (typeof LIGHTING_QUALITY_LEVELS)[number];

/** The levels the GM picks from; `high` is the lighting as it always was. */
export const LIGHTING_QUALITY: Record<LightingQualityLevel, LightingQuality> = {
  high: { maxTexels: MAX_TEXELS, bounceMaxSide: Infinity, flickerMs: FLICKER_INTERVAL_MS, tileRays: TILE_RAYS, liquidFps: 30 },
  balanced: { maxTexels: 2048, bounceMaxSide: 6144, flickerMs: 66, tileRays: 16, liquidFps: 15, compositePixelRatio: 1 },
  saver: { maxTexels: 1024, bounceMaxSide: 0, flickerMs: null, tileRays: 8, liquidFps: 10, compositePixelRatio: 1 },
};

export const DEFAULT_LIGHTING_QUALITY: LightingQuality = LIGHTING_QUALITY.high;

/**
 * A level below the view seen through its openings: `balanced` without bounce under `high`, its
 * lights flickering 4 times a second (each redraw draws the level's snapshot and the view's stage
 * anew, and the flicker shows only through the openings, dimmed); else `saver`, steady.
 */
/** How often flickering lights below are redrawn at `high`: each redraw draws the level's snapshot anew, and 4 a second reads as flicker through an opening. */
const BELOW_FLICKER_MS = 250;
const BELOW_HIGH: LightingQuality = { ...LIGHTING_QUALITY.balanced, bounceMaxSide: 0, flickerMs: BELOW_FLICKER_MS };

/**
 * The quality a level below the view is lit at while the view is lit at `quality`: a tier lower,
 * never with bounce and with slower flicker, since it shows only through openings, dimmed (`LevelsBelow`).
 */
export function belowQuality(quality: LightingQuality): LightingQuality {
  return quality.maxTexels > LIGHTING_QUALITY.balanced.maxTexels ? BELOW_HIGH : LIGHTING_QUALITY.saver;
}

export function isLightingQualityLevel(value: unknown): value is LightingQualityLevel {
  return typeof value === 'string' && (LIGHTING_QUALITY_LEVELS as readonly string[]).includes(value);
}

/** Whether light bounces on a map of `bounds` at `quality`. */
export function bouncesOn(quality: LightingQuality, bounds: { width: number; height: number }): boolean {
  return Math.max(bounds.width, bounds.height) <= quality.bounceMaxSide;
}

/** Where a lighting view reads its quality, and hears that it changed (Atlas' settings on this device). */
export interface LightingQualitySource {
  current(): LightingQuality;
  /** Returns the unsubscribe function. */
  onChange(listener: () => void): () => void;
}

/**
 * World pixels of a texel of the lighting's world textures on a map of `bounds` whose grid cell is
 * `cell` px (unknown: the map's size alone decides, `worldTexel`): what the picture is drawn at.
 * The picture's resolution follows the grid, not the image: a cell spans at most `CELL_TEXELS`, so a
 * map drawn at 400 px a cell (a generated dungeon) is lit like one of 70 px a cell with the same
 * rooms instead of with up to thirty times the texels, and a map of 70 px cells or less as before.
 * The rules always trace at the map's own texel (`worldTexel(bounds)`), at every quality.
 */
export function pictureTexel(bounds: { width: number; height: number }, quality: LightingQuality, cell?: number): number {
  const texel = worldTexel(bounds, quality.maxTexels);
  return cell && Number.isFinite(cell) && cell > 0 ? Math.max(texel, cell / CELL_TEXELS) : texel;
}
