import { mixColours, parseHex, type Rgb } from '../palette';
import type { PlantPalette } from '../growth/forms';
import type { StoneColours } from './colours';

/**
 * The colours plants are painted in, worked out from the look: each kind of plant a ramp from its
 * shaded depth to its lit tips, drawn a little towards the look's floor so the greens belong to its
 * paper; on a dark look the ramps sink towards the floor, so plants stay dark and quiet; in
 * monochrome every ramp is tones between the look's two colours.
 */

/** A ramp from shade to light, as three stops. */
export type Ramp = readonly [Rgb, Rgb, Rgb];

export interface PlantColours {
  leaves: Readonly<Record<PlantPalette, Ramp>>;
  /** Stems and canes of each kind. */
  stems: Readonly<Record<PlantPalette, Rgb>>;
  petals: readonly Rgb[];
  /** A blossom's heart. */
  heart: Rgb;
  moss: Ramp;
  /** The fine line round a leaf. */
  edge: Rgb;
  /** Where a root breaks the floor. */
  hole: Rgb;
  /** What an old leaf turns towards: a bramble's red, a dead leaf's rust. */
  autumn: Rgb;
  /** Light on a leaf's rib and veins. */
  vein: Rgb;
  dark: boolean;
}

/** Plants of a light look, before they are drawn towards its floor: deep, mid and lit. */
const LIGHT: Readonly<Record<PlantPalette, readonly [string, string, string]>> = {
  green: ['#22381d', '#46642c', '#93ab55'],
  fern: ['#2b4620', '#557a30', '#a6c061'],
  grass: ['#3e5320', '#6f8a33', '#c2c672'],
  flowering: ['#2c4825', '#4f7236', '#9bb766'],
  dead: ['#4a3b2b', '#7a6247', '#b49c74'],
  fungus: ['#8c7454', '#cdb591', '#f2e8d2'],
  root: ['#3a2b1f', '#62492f', '#9a7c58'],
  bramble: ['#1e3220', '#3f5a2e', '#7f9a4c'],
};

const STEMS: Readonly<Record<PlantPalette, string>> = {
  green: '#4a3a2a',
  fern: '#4d5f27',
  grass: '#5d6f2a',
  flowering: '#4f5a2c',
  dead: '#4a3d31',
  fungus: '#a39780',
  root: '#5a4430',
  bramble: '#5b3328',
};

/** Blossom colours, one family chosen per dungeon. */
const PETALS: readonly (readonly string[])[] = [
  ['#f4ecdc', '#ece0c6', '#fbf6ea'],
  ['#ead0d6', '#dfb7c2', '#f3e1e4'],
  ['#d6cbe8', '#c3b5de', '#e6def0'],
];

const rgb = (hex: string): Rgb => parseHex(hex);

export function plantColours(c: StoneColours, seed: number): PlantColours {
  const toFloor = c.dark ? 0.36 : 0.12;
  const sink = (hex: string): string => (c.dark ? mixColours(mixColours(hex, c.floor, toFloor), '#000000', 0.06) : mixColours(hex, c.floor, toFloor));
  // On a dark look wood and bark catch a little of the look's pale ink, or they vanish into the floor.
  const bark = (hex: string): string => (c.dark ? mixColours(sink(hex), c.line, 0.14) : sink(hex));
  const tone = (t: number): Rgb => rgb(mixColours(c.floor, c.line, t));
  const ramp = (stops: readonly [string, string, string]): Ramp => (c.mono ? [tone(0.72), tone(0.48), tone(0.22)] : [rgb(sink(stops[0])), rgb(sink(stops[1])), rgb(sink(stops[2]))]);
  const leaves = Object.fromEntries(Object.entries(LIGHT).map(([kind, stops]) => [kind, ramp(stops)])) as Record<PlantPalette, Ramp>;
  if (c.mono) leaves.fungus = [tone(0.4), tone(0.12), tone(0.02)];
  const stems = Object.fromEntries(Object.entries(STEMS).map(([kind, hex]) => [kind, c.mono ? tone(0.7) : rgb(bark(hex))])) as Record<PlantPalette, Rgb>;
  if (c.dark && !c.mono) leaves.root = ramp(['#4a3a2c', '#7a6248', '#ab926c']);
  const family = PETALS[seed % PETALS.length]!;
  return {
    leaves,
    stems,
    petals: family.map(hex => (c.mono ? tone(0.05) : rgb(c.dark ? mixColours(hex, c.floor, 0.35) : hex))),
    heart: c.mono ? tone(0.5) : rgb(sink('#d9a93e')),
    moss: c.mono ? [tone(0.6), tone(0.42), tone(0.26)] : c.dark ? ramp(['#2a3a1d', '#3f5528', '#6a7d3e']) : ramp(['#33481c', '#55702a', '#8fa443']),
    edge: c.mono ? tone(0.9) : rgb(c.dark ? '#000000' : mixColours('#14200f', c.line, 0.3)),
    hole: rgb(c.dark ? mixColours(c.floor, '#000000', 0.75) : mixColours(c.line, '#000000', 0.3)),
    autumn: c.mono ? tone(0.55) : rgb(sink('#7a2e24')),
    vein: c.mono ? tone(0.15) : rgb(c.dark ? mixColours('#a8b878', c.floor, 0.5) : '#d6dca0'),
    dark: c.dark,
  };
}

/** A point of a ramp: 0 its depth, 0.5 its middle, 1 its lit end, as a CSS colour. */
export function rampAt(ramp: Ramp, t: number, alpha = 1): string {
  const k = Math.max(0, Math.min(1, t));
  const [a, b] = k < 0.5 ? [ramp[0], ramp[1]] : [ramp[1], ramp[2]];
  const f = k < 0.5 ? k * 2 : k * 2 - 1;
  return css([Math.round(a[0] + (b[0] - a[0]) * f), Math.round(a[1] + (b[1] - a[1]) * f), Math.round(a[2] + (b[2] - a[2]) * f)], alpha);
}

export function css([r, g, b]: Rgb, alpha = 1): string {
  return alpha >= 1 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${alpha})`;
}
