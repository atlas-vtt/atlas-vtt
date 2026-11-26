import { pinSize } from '../styles/designTokens';

/** A map's size in world pixels. */
export interface MapSize {
  readonly width: number;
  readonly height: number;
}

/**
 * How large a pin is on screen, in CSS pixels of its badge's diameter: `max`, a pin's full size,
 * the size it has always had in play, and never less than `min`, where it can still be found and
 * pressed.
 */
export const PIN_SCREEN = { max: 2 * pinSize.badgeRadius, min: 12 } as const;

/**
 * A pin's size as a share of its map's shorter side: pins belong to the map, so as the map grows
 * smaller on screen they shrink with it instead of covering it (their full size again from the
 * zoom at which the map holds them at this share).
 */
export const PIN_MAP_SHARE = 0.04;

/** Below this diameter on screen a pin is a dot in its icon's tone: its glyph and name need room it no longer has. */
export const PIN_DOT_BELOW = 20;

/**
 * A pin's badge diameter on screen at viewport `zoom` on a map of `map`'s size: its share of the
 * map, between `PIN_SCREEN.min` and `.max`; full size while the map's size is unknown. Pure.
 */
export function pinScreenDiameter(zoom: number, map: MapSize | null): number {
  if (!(zoom > 0) || map === null || !(map.width > 0) || !(map.height > 0)) return PIN_SCREEN.max;
  const fromMap = PIN_MAP_SHARE * Math.min(map.width, map.height) * zoom;
  return Math.min(PIN_SCREEN.max, Math.max(PIN_SCREEN.min, fromMap));
}

/** The world scale of a pin's group, whose badge is `2 * pinSize.badgeRadius` units across. Pure. */
export function pinGroupScale(zoom: number, map: MapSize | null): number {
  const viewZoom = zoom > 0 ? zoom : 1;
  return pinScreenDiameter(viewZoom, map) / (2 * pinSize.badgeRadius) / viewZoom;
}

/** Whether pins are dots at this size: a whole map at a glance, where only their places matter. */
export function pinsAreDots(zoom: number, map: MapSize | null): boolean {
  return pinScreenDiameter(zoom, map) < PIN_DOT_BELOW;
}
