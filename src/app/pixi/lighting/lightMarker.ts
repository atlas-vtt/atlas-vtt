import { ambientGate, sleeps } from '../../lighting/lightActivity';
import { beamOf } from '../../lighting/lightBeam';
import { lightKindOf } from '../../lighting/lightPresets';
import type { LightKind, LightSource } from '../../types/lightingTypes';
import type { Point } from '../../types/visionTypes';
import { canvasBadgeColors } from '../utils/canvasBadgeColors';
import { cssColorToHexNumber, getObsidianAccentColor } from '../utils/colorUtils';
import { mapMarkerScale } from '../utils/mapMarkerScale';

/** Screen pixels at marker scale 1. A light's badge is smaller than a note pin's (20). */
export const LIGHT_MARKER_RADIUS = 14;
export const LIGHT_MARKER_GLYPH_SIZE = 18;
/** A little wider than the badge, so its edge is easy to press. */
export const LIGHT_MARKER_HIT_RADIUS = 16;

/** Colours below this contrast against the badge are moved towards black or white until they reach it. */
const MIN_GLYPH_CONTRAST = 3;
const FALLBACK_COLOR = 0xffcc66;
const HOVER_LIFT = 1.12;
const DRAG_LIFT = 1.2;

export interface LightMarkerState {
  hovered: boolean;
  /** Selected with the lighting tool, or the light whose popover is open. */
  selected: boolean;
  dragging: boolean;
}

/** The badge colours of the theme (`canvasBadgeColors`) and its accent. */
export interface LightMarkerTheme {
  background: number;
  stroke: number;
  accent: number;
}

/** The theme's badge colours and accent, as the pins and the interface use them. */
export function lightMarkerTheme(): LightMarkerTheme {
  return { ...canvasBadgeColors(), accent: cssColorToHexNumber(getObsidianAccentColor()) };
}

/** How one light's marker is drawn. */
export interface LightMarkerLook {
  kind: LightKind;
  glyphTint: number;
  glyphAlpha: number;
  ringColor: number;
  ringAlpha: number;
  /** The ring around a selected marker. */
  accent: number | null;
  /** The world angle a light with a beam faces, where the badge has a pointer; null for one that shines all around. */
  direction: number | null;
  /** A light that follows the ambient light carries a small moon on its badge. */
  moon: boolean;
  /** Scale on top of the marker's size on screen. */
  lift: number;
}

function channels(color: number): [number, number, number] {
  return [(color >> 16) & 0xff, (color >> 8) & 0xff, color & 0xff];
}

function luminance(color: number): number {
  const [r, g, b] = channels(color).map((channel) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio of two colours, 1 to 21. */
export function contrast(a: number, b: number): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (light + 0.05) / (dark + 0.05);
}

function mix(color: number, towards: number, amount: number): number {
  const from = channels(color);
  const to = channels(towards);
  const [r, g, b] = from.map((channel, index) => Math.round(channel + (to[index]! - channel) * amount)) as [number, number, number];
  return (r << 16) | (g << 8) | b;
}

/**
 * `color` as it reads on `background`: unchanged where it contrasts enough, else moved towards
 * black on a light badge and towards white on a dark one, no further than needed, so a pale
 * lantern keeps its hue on the light theme's badge.
 */
export function readableTint(color: number, background: number): number {
  if (contrast(color, background) >= MIN_GLYPH_CONTRAST) return color;
  const towards = luminance(background) > 0.5 ? 0x000000 : 0xffffff;
  let low = 0;
  let high = 1;
  for (let i = 0; i < 12; i++) {
    const amount = (low + high) / 2;
    if (contrast(mix(color, towards, amount), background) >= MIN_GLYPH_CONTRAST) high = amount;
    else low = amount;
  }
  return mix(color, towards, high);
}

/** `#rrggbb` as a number; a warm light colour for anything else. */
export function lightColorNumber(color: string): number {
  return /^#[0-9a-f]{6}$/i.test(color) ? Number.parseInt(color.slice(1), 16) : FALLBACK_COLOR;
}

/**
 * The look of a light's marker: its kind's glyph and a thin ring, both in the light's colour;
 * a light that is out keeps the ring faint and its glyph in the badge's own dimmed ink, whether
 * the GM switched it off or it follows the ambient light and the scene's `ambient` light is too
 * bright for it.
 */
export function lightMarkerLook(light: LightSource, state: LightMarkerState, theme: LightMarkerTheme, ambient = 0): LightMarkerLook {
  const color = readableTint(lightColorNumber(light.emission.color), theme.background);
  const off = !!light.hidden || sleeps(light, ambient);
  return {
    kind: lightKindOf(light.emission),
    glyphTint: off ? theme.stroke : color,
    glyphAlpha: off ? 0.4 : 1,
    ringColor: color,
    ringAlpha: off ? 0.3 : 0.9,
    accent: state.selected ? theme.accent : null,
    direction: beamOf(light)?.facing ?? null,
    moon: ambientGate(light) !== undefined,
    lift: state.dragging ? DRAG_LIFT : state.hovered ? HOVER_LIFT : 1,
  };
}

/** World radius within which a press at viewport `zoom` hits a marker. */
export function lightMarkerHitRadius(zoom: number): number {
  return LIGHT_MARKER_HIT_RADIUS * mapMarkerScale(zoom);
}

/** The light whose marker is at the world `point` at viewport `zoom`: the nearest one within reach. */
export function lightMarkerAt(lights: readonly LightSource[], point: Point, zoom: number): string | null {
  let nearest: string | null = null;
  let best = lightMarkerHitRadius(zoom);
  for (const light of lights) {
    const distance = Math.hypot(point.x - light.x, point.y - light.y);
    if (distance <= best) {
      best = distance;
      nearest = light.id;
    }
  }
  return nearest;
}
