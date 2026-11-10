/**
 * The flash on the token whose turn begins, as pure numbers: a warm pool of light on the floor
 * beneath the token, like a stage light, with a fine rim around it, that swells in, holds a moment
 * and fades away. The figure stands in the pool: it shows only where the token's art is transparent
 * (`TurnMarker` masks it with the art). A gold of its own, never the theme's accent, which the
 * selection keeps. The values are the look the online player page ports
 * (docs/plans/2026-10-20-initiative-turn-look.md).
 */
import { easeOut } from '../../../utils/motion';

/** The marker's look. The pool's distances are token-UI units (`restingTokenUIScale`), the rim's screen pixels. */
export const TURN_LOOK = {
  /** The spotlight's gold, rgb(236, 184, 72). */
  gold: 0xecb848,
  /** How far the pool reaches beyond a medium token's edge; a larger token's reaches further (`poolSpread`). */
  poolReach: 8.5,
  /** The pool's opacity from its middle (share 0) to its edge (share 1), straight between the stops. */
  poolStops: [[0, 0.42], [0.62, 0.3], [0.8, 0.14], [1, 0]] as const,
  /**
   * How much of the pool lies over the floor (normal blending), and how much light it adds on top:
   * together they read like the gold laid soft-light and then normal at 0.55 over the floor, which
   * warms a wooden floor and lights a dark one without washing parchment out.
   */
  poolCover: 0.6,
  poolLight: 0.1,
  /** The rim: its distance outside the token's edge, its width and opacity, and the dark keyline beneath it. */
  rimGap: 3,
  rimWidth: 1.2,
  rimAlpha: 0.95,
  keylineWidth: 2,
  keylineAlpha: 0.25,
} as const;

/** How the flash runs: milliseconds to swell in, to hold and to fade out, the scale it swells from, and whether it fades plainly (linear, no easing). */
export interface FlashTiming {
  readonly enter: number;
  readonly hold: number;
  readonly exit: number;
  readonly from: number;
  readonly plain: boolean;
}

/** The flash, and with reduced motion a short plain fade in and out without the swell. */
export const FLASH: { readonly full: FlashTiming; readonly reduced: FlashTiming } = {
  full: { enter: 250, hold: 700, exit: 900, from: 0.8, plain: false },
  reduced: { enter: 150, hold: 600, exit: 300, from: 1, plain: true },
};

/** A medium token's edge, in UI units from its middle. */
const MEDIUM_EDGE = 35;

/** How much further a token's pool reaches than a medium token's, for a token whose edge lies `edge` UI units from its middle. */
export function poolSpread(edge: number): number {
  return Math.sqrt(Math.max(1, edge / MEDIUM_EDGE));
}

/** The pool's radius in world units, for a token whose edge is `outerRadius` world units from its middle, at `unit` world units per UI unit. */
export function poolRadius(outerRadius: number, unit: number): number {
  return outerRadius + TURN_LOOK.poolReach * poolSpread(outerRadius / unit) * unit;
}

/** The pool's opacity at `share` of its radius (0 in the middle, 1 at its edge). */
export function poolAlphaAt(share: number): number {
  const stops = TURN_LOOK.poolStops;
  if (!(share >= 0)) return stops[0][1];
  for (let index = 1; index < stops.length; index += 1) {
    const [end, endAlpha] = stops[index]!;
    if (share > end) continue;
    const [start, startAlpha] = stops[index - 1]!;
    return startAlpha + ((share - start) / (end - start)) * (endAlpha - startAlpha);
  }
  return 0;
}

/**
 * What the pool's texture holds at `share` of its radius, premultiplied: `alpha` covers the floor,
 * `light` is its colour, which adds light beyond what covering alone would (`poolLight`).
 */
export function poolTexel(share: number): { readonly alpha: number; readonly light: number } {
  const pool = poolAlphaAt(share);
  return { alpha: pool * TURN_LOOK.poolCover, light: Math.min(1, pool * (TURN_LOOK.poolCover + TURN_LOOK.poolLight)) };
}

/** The rim's middle line in screen pixels from the token's middle, at `zoom` screen pixels per world unit. */
export function rimRadius(outerRadius: number, zoom: number): number {
  return outerRadius * zoom + TURN_LOOK.rimGap;
}

/** How the flash shows `elapsed` milliseconds after the turn began; `done` once it has faded away. */
export interface FlashAppearance {
  readonly alpha: number;
  readonly scale: number;
  readonly done: boolean;
}

/** `value` eased with zero slope at both ends. */
const smooth = (value: number): number => value * value * (3 - 2 * value);
const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

export function flashAppearance(elapsed: number, timing: FlashTiming): FlashAppearance {
  const { enter, hold, exit, from, plain } = timing;
  if (!(elapsed > 0)) return { alpha: 0, scale: from, done: false };
  if (elapsed < enter) {
    const eased = plain ? elapsed / enter : easeOut(elapsed / enter);
    return { alpha: eased, scale: from + (1 - from) * eased, done: false };
  }
  if (elapsed < enter + hold) return { alpha: 1, scale: 1, done: false };
  const out = clamp01((elapsed - enter - hold) / exit);
  return { alpha: 1 - (plain ? out : smooth(out)), scale: 1, done: out >= 1 };
}
