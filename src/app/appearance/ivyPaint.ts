import { clamp } from '../utils/math';

/**
 * The Medieval look's ivy in a colour of the GM's: its drawings (styles/looks/atlas-looks.css) are painted with four
 * greens, from the ink of the outlines to the leaves' highlights, and a picked colour takes the leaves' green with the
 * other shades kept as far above or below it as the greens lie, so the ivy keeps its shading in any colour.
 */

/** The greens of the drawings, darkest first: the outlines' ink, the shaded leaves, the leaves, their highlights. */
const IVY_GREENS = ['#2a3c08', '#567119', '#789532', '#94b24a'] as const;
const OUTLINE = IVY_GREENS[0];
/** The leaves' own green, which a picked colour takes the place of. */
export const IVY_LEAF = IVY_GREENS[2];

/** The outlines stay ink: however light the colour, they never get lighter than this (OKLab lightness). */
const OUTLINE_MAX_LIGHTNESS = 0.42;
const SHADE_LIGHTNESS = { min: 0.14, max: 0.96 } as const;

interface Oklch {
  l: number;
  c: number;
  h: number;
}

/** Each green of the drawings, lower case, with the colour it is painted in for `hex` (`#rrggbb`). */
export function ivyPalette(hex: string): ReadonlyMap<string, string> {
  const leaf = toOklch(IVY_LEAF);
  const picked = toOklch(hex);
  const lift = picked.l - leaf.l;
  const chroma = leaf.c > 0 ? picked.c / leaf.c : 0;
  return new Map(IVY_GREENS.map((green) => {
    const shade = toOklch(green);
    const l = green === OUTLINE
      ? clamp(shade.l + lift / 2, SHADE_LIGHTNESS.min, OUTLINE_MAX_LIGHTNESS)
      : clamp(shade.l + lift, SHADE_LIGHTNESS.min, SHADE_LIGHTNESS.max);
    return [green, fromOklch({ l, c: shade.c * chroma, h: picked.h + shade.h - leaf.h })];
  }));
}

/** A drawing (a `url("data:image/svg+xml,…")` with `#` written `%23`) with its greens painted after `palette`. */
export function repaintDrawing(drawing: string, palette: ReadonlyMap<string, string>): string {
  return drawing.replace(/%23([0-9a-f]{6})/gi, (written, digits: string) => {
    const painted = palette.get(`#${digits.toLowerCase()}`);
    return painted ? `%23${painted.slice(1)}` : written;
  });
}

function toOklch(hex: string): Oklch {
  const [r, g, b] = [1, 3, 5].map((at) => toLinear(parseInt(hex.slice(at, at + 2), 16) / 255)) as [number, number, number];
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const lightness = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s;
  const a = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s;
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s;
  return { l: lightness, c: Math.hypot(a, bb), h: Math.atan2(bb, a) };
}

/** `#rrggbb` of an OKLCH colour, its chroma lowered until sRGB holds it. */
function fromOklch(colour: Oklch): string {
  let rgb = oklchToLinear(colour);
  if (!inGamut(rgb)) {
    let low = 0;
    let high = colour.c;
    for (let step = 0; step < 24; step += 1) {
      const c = (low + high) / 2;
      if (inGamut(oklchToLinear({ ...colour, c }))) low = c;
      else high = c;
    }
    rgb = oklchToLinear({ ...colour, c: low });
  }
  return `#${rgb.map((channel) => Math.round(clamp(toGamma(channel), 0, 1) * 255).toString(16).padStart(2, '0')).join('')}`;
}

function oklchToLinear({ l: lightness, c, h }: Oklch): [number, number, number] {
  const a = c * Math.cos(h);
  const b = c * Math.sin(h);
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.2914855480 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
  ];
}

const inGamut = (rgb: readonly number[]): boolean => rgb.every((channel) => channel >= -1e-4 && channel <= 1 + 1e-4);
const toLinear = (v: number): number => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const toGamma = (v: number): number => (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055);
