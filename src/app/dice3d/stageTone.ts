/**
 * **A colour painted on a die, as the stage shows it.** The stage lights a
 * face and runs it through three.js' ACES filmic curve, and a body comes out
 * about twice as bright as its colour: the presets' teal shows as mint, their
 * violet as lavender. Whether numerals read is a question of these colours,
 * not of the ones painted.
 */

import { srgbToLinear } from '../lighting/srgb';
import type { Rgb } from './diceLook';

/**
 * How the stage lights a face lying up: a gain per channel (its warm key and
 * fill), and the light a face gets even where its colour is black (the room's
 * reflection on a matte face). Fitted to the faces and numerals of every
 * built-in colour as `tests/gpu/diceNumeralContrast.gpu.test.ts` measures them,
 * to within 0.006 of luminance.
 */
const STAGE_GAIN: Rgb = [1.98, 1.98 * 0.96, 1.98 * 0.94];
const STAGE_AMBIENT = 0.032;
/** three.js' ACES filmic tone mapping: its matrices in rows, and its curve, at an exposure of 1. */
const ACES_IN = [[0.59719, 0.35458, 0.04823], [0.076, 0.90834, 0.01566], [0.0284, 0.13383, 0.83777]] as const;
const ACES_OUT = [[1.60475, -0.53108, -0.07367], [-0.10208, 1.10813, -0.00605], [-0.00327, -0.07276, 1.07602]] as const;
const ACES_EXPOSURE = 1 / 0.6;

function acesCurve(v: number): number {
  return (v * (v + 0.0245786) - 0.000090537) / (v * (0.983729 * v + 0.432951) + 0.238081);
}

function times(matrix: readonly (readonly number[])[], v: readonly number[]): number[] {
  return matrix.map((row) => row[0]! * v[0]! + row[1]! * v[1]! + row[2]! * v[2]!);
}

function luminanceOfLinear([r, g, b]: readonly number[]): number {
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

/** A colour's channels in linear light. */
export function linearOf(rgb: Rgb): number[] {
  return rgb.map((channel) => srgbToLinear(channel / 255));
}

/** Relative luminance, as WCAG defines it. */
export function luminance(rgb: Rgb): number {
  return luminanceOfLinear(linearOf(rgb));
}

/** The luminance of a colour painted on a face, as the stage shows that face lying up. */
export function shownLuminance(rgb: Rgb): number {
  const lit = linearOf(rgb).map((channel, i) => (STAGE_GAIN[i]! * channel + STAGE_AMBIENT) * ACES_EXPOSURE);
  const mapped = times(ACES_OUT, times(ACES_IN, lit).map(acesCurve));
  return luminanceOfLinear(mapped.map((c) => Math.min(1, Math.max(0, c))));
}

/** The WCAG contrast ratio of numerals in `ink` on a face of `body`, as the stage shows both. */
export function shownContrast(ink: Rgb, body: Rgb): number {
  const [a, b] = [shownLuminance(ink), shownLuminance(body)];
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
