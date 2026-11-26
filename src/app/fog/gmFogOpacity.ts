/** How opaque fog is in the GM's view unless the GM chose otherwise: half, so the map shows through. */
export const DEFAULT_GM_FOG_OPACITY = 0.5;

/** The opacities the GM can choose between; players' fog is always opaque. */
export const GM_FOG_OPACITY_RANGE = { min: 0.1, max: 1 } as const;

/** A stored opacity as one the fog can take: a number, or a number as text, within the range; anything else is the default. */
export function readGmFogOpacity(stored: unknown): number {
  const value = typeof stored === 'string' && stored.trim() !== '' ? Number(stored) : stored;
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_GM_FOG_OPACITY;
  return Math.min(GM_FOG_OPACITY_RANGE.max, Math.max(GM_FOG_OPACITY_RANGE.min, value));
}
