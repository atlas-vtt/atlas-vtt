import { FLICKER_INTERVAL_MS, MAX_TEXELS } from './lightingConstants';

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
}

export const LIGHTING_QUALITY_LEVELS = ['high', 'balanced', 'saver'] as const;
export type LightingQualityLevel = (typeof LIGHTING_QUALITY_LEVELS)[number];

/** The levels the GM picks from; `high` is the lighting as it always was. */
export const LIGHTING_QUALITY: Record<LightingQualityLevel, LightingQuality> = {
  high: { maxTexels: MAX_TEXELS, bounceMaxSide: Infinity, flickerMs: FLICKER_INTERVAL_MS },
  balanced: { maxTexels: 2048, bounceMaxSide: 6144, flickerMs: 66 },
  saver: { maxTexels: 1024, bounceMaxSide: 0, flickerMs: null },
};

export const DEFAULT_LIGHTING_QUALITY: LightingQuality = LIGHTING_QUALITY.high;

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
