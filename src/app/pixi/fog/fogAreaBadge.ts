/**
 * How a fog area's badge looks and where it is hit: the pins' badge in the theme's colours, a
 * size smaller, with an eye while the area is revealed and an eye struck through while it is hidden.
 */
import type { Graphics, Texture } from 'pixi.js';
import type { Point } from '../../types/visionTypes';
import type { CanvasBadgeTheme } from '../utils/canvasBadgeColors';
import { mapMarkerScale } from '../utils/mapMarkerScale';
import { createLineGlyphTexture } from '../utils/pinIconTexture';

/** Screen pixels at marker scale 1. Smaller than a light's marker (14) and a note pin's badge (20). */
export const FOG_BADGE_RADIUS = 12;
export const FOG_BADGE_GLYPH_SIZE = 15;
/** A little wider than the badge, so its edge is easy to press. */
const FOG_BADGE_HIT_RADIUS = 14;
/** How a revealed area's badge keeps back outside the fog tool: its size as a share of a badge's, and how opaque it is. */
export const FOG_BADGE_QUIET = { scale: 0.75, alpha: 0.6 } as const;

/** The paths of Lucide's `eye` and `eye-off` on their 24×24 canvas. */
export const FOG_BADGE_GLYPHS = {
  revealed: [
    'M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0',
    'M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
  ],
  hidden: [
    'M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49',
    'M14.084 14.158a3 3 0 0 1-4.242-4.242',
    'M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143',
    'm2 2 20 20',
  ],
} as const;

export type FogBadgeGlyph = keyof typeof FOG_BADGE_GLYPHS;

/** The badges' glyphs as textures: each in white, rasterised once and tinted per badge. */
export class FogBadgeGlyphs {
  private readonly textures = new Map<FogBadgeGlyph, Texture | null>();

  /** The glyph's texture; null where no 2D canvas is available. */
  of(glyph: FogBadgeGlyph): Texture | null {
    if (!this.textures.has(glyph)) this.textures.set(glyph, createLineGlyphTexture(FOG_BADGE_GLYPHS[glyph]));
    return this.textures.get(glyph) ?? null;
  }

  destroy(): void {
    for (const texture of this.textures.values()) {
      if (texture && !texture.destroyed) texture.destroy(true);
    }
    this.textures.clear();
  }
}

/** How one area's badge is drawn. */
export interface FogBadgeLook {
  glyph: FogBadgeGlyph;
  /** The pointer is on it: its ring takes the theme's accent. */
  hovered: boolean;
}

export function sameBadgeLook(a: FogBadgeLook, b: FogBadgeLook): boolean {
  return a.glyph === b.glyph && a.hovered === b.hovered;
}

/** Draws the badge's disc and ring around the origin, in screen pixels at marker scale 1. The glyph is a sprite above it. */
export function drawFogBadge(g: Graphics, look: FogBadgeLook, theme: CanvasBadgeTheme): void {
  g.clear();
  // A dark hairline keeps the badge's edge on a map as light as the badge.
  g.circle(0, 0, FOG_BADGE_RADIUS + 0.5).stroke({ width: 1, color: 0x000000, alpha: 0.35 });
  g.circle(0, 0, FOG_BADGE_RADIUS).fill({ color: theme.background, alpha: 0.95 });
  if (look.hovered) g.circle(0, 0, FOG_BADGE_RADIUS - 1).stroke({ width: 2, color: theme.accent });
  else g.circle(0, 0, FOG_BADGE_RADIUS - 0.75).stroke({ width: 1, color: theme.stroke, alpha: 0.35 });
}

/** World radius of a badge at viewport `zoom`. */
export function fogBadgeRadius(zoom: number): number {
  return FOG_BADGE_RADIUS * mapMarkerScale(zoom);
}

/**
 * The area whose badge is at the world `point` at viewport `zoom`: the nearest one within its
 * reach. `spots` says where each badge sits, and how large it is drawn as a share of a badge's
 * size (unset: whole).
 */
export function fogBadgeAt(spots: Iterable<readonly [string, Point, number?]>, point: Point, zoom: number): string | null {
  let nearest: string | null = null;
  let best = Infinity;
  const reach = FOG_BADGE_HIT_RADIUS * mapMarkerScale(zoom);
  for (const [id, spot, scale = 1] of spots) {
    const distance = Math.hypot(point.x - spot.x, point.y - spot.y);
    if (distance <= reach * scale && distance <= best) {
      best = distance;
      nearest = id;
    }
  }
  return nearest;
}
