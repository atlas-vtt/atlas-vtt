/**
 * Colours as a stylesheet defines them, worked out the way the browser does, and their WCAG 2.1 contrast:
 * `var()` with its fallback, `#rgb`/`#rrggbb`, `rgb()`, `black`/`white`/`transparent`, and `color-mix()` in srgb or
 * oklch, a mix with `transparent` giving the colour at that alpha.
 */
export type Rgba = readonly [number, number, number, number];
export type Variables = ReadonlyMap<string, string>;

const NAMED: Record<string, Rgba> = { black: [0, 0, 0, 1], white: [255, 255, 255, 1], transparent: [0, 0, 0, 0] };

function linear(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function encoded(value: number): number {
  const v = Math.min(1, Math.max(0, value));
  return 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);
}

/** WCAG 2.1 relative luminance of an opaque colour. */
function luminance([r, g, b]: Rgba): number {
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

/** WCAG 2.1 contrast ratio of two opaque colours. */
export function contrast(a: Rgba, b: Rgba): number {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
}

/** `top` painted over an opaque `ground`. */
export function over(top: Rgba, ground: Rgba): Rgba {
  const a = top[3];
  return [top[0] * a + ground[0] * (1 - a), top[1] * a + ground[1] * (1 - a), top[2] * a + ground[2] * (1 - a), 1];
}

export function hex([r, g, b]: Rgba): string {
  return '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
}

function toOklab([r, g, b]: Rgba): [number, number, number] {
  const [lr, lg, lb] = [linear(r), linear(g), linear(b)];
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function fromOklab([L, A, B]: [number, number, number], alpha: number): Rgba {
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return [
    encoded(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    encoded(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    encoded(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
    alpha,
  ];
}

/** Splits at top-level commas, leaving those inside parentheses. */
function args(text: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '(') depth++;
    else if (text[i] === ')') depth--;
    else if (text[i] === ',' && depth === 0) {
      out.push(text.slice(start, i).trim());
      start = i + 1;
    }
  }
  out.push(text.slice(start).trim());
  return out;
}

function mix(space: string, first: string, second: string, vars: Variables): Rgba {
  const part = (text: string): { colour: Rgba; share: number | null } => {
    const m = /^(.*?)(?:\s+([\d.]+)%)?$/s.exec(text.trim());
    return { colour: colourOf(m![1], vars), share: m![2] === undefined ? null : Number(m![2]) / 100 };
  };
  const a = part(first);
  const b = part(second);
  const pa = a.share ?? (b.share === null ? 0.5 : 1 - b.share);
  // A mix with transparent keeps the other colour and takes the share as its alpha (premultiplied interpolation).
  if (b.colour[3] === 0) return [a.colour[0], a.colour[1], a.colour[2], a.colour[3] * pa];
  if (a.colour[3] === 0) return [b.colour[0], b.colour[1], b.colour[2], b.colour[3] * (1 - pa)];
  if (space === 'srgb') return [0, 1, 2, 3].map((i) => a.colour[i] * pa + b.colour[i] * (1 - pa)) as unknown as Rgba;
  const la = toOklab(a.colour);
  const lb = toOklab(b.colour);
  if (space === 'oklab') return fromOklab([la[0] * pa + lb[0] * (1 - pa), la[1] * pa + lb[1] * (1 - pa), la[2] * pa + lb[2] * (1 - pa)], 1);
  if (space !== 'oklch') throw new Error(`color-mix in ${space} is not worked out here`);
  // Polar: lightness and chroma straight, the hue the shorter way round; a grey has no hue and takes the other's.
  const polar = ([L, A, B]: [number, number, number]): [number, number, number | null] => {
    const chroma = Math.hypot(A, B);
    return [L, chroma, chroma < 1e-4 ? null : Math.atan2(B, A)];
  };
  const [L1, C1, H1] = polar(la);
  const [L2, C2, H2] = polar(lb);
  const h1 = H1 ?? H2 ?? 0;
  const h2 = H2 ?? h1;
  let dh = h2 - h1;
  if (dh > Math.PI) dh -= 2 * Math.PI;
  if (dh < -Math.PI) dh += 2 * Math.PI;
  const L = L1 * pa + L2 * (1 - pa);
  const C = C1 * pa + C2 * (1 - pa);
  const H = h1 + dh * (1 - pa);
  return fromOklab([L, C * Math.cos(H), C * Math.sin(H)], 1);
}

/** The colour a declaration's value comes to, given the custom properties in force. */
export function colourOf(value: string, vars: Variables): Rgba {
  const text = value.trim();
  const variable = /^var\(\s*(--[\w-]+)\s*(?:,\s*(.*))?\)$/s.exec(text);
  if (variable) {
    const defined = vars.get(variable[1]) ?? variable[2];
    if (defined === undefined) throw new Error(`${variable[1]} is not defined`);
    return colourOf(defined, vars);
  }
  if (text in NAMED) return NAMED[text];
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(text);
  if (short) return [parseInt(short[1] + short[1], 16), parseInt(short[2] + short[2], 16), parseInt(short[3] + short[3], 16), 1];
  const long = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(text);
  if (long) return [parseInt(long[1], 16), parseInt(long[2], 16), parseInt(long[3], 16), 1];
  const rgb = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[/,]\s*([\d.]+)(%?))?\s*\)$/.exec(text);
  if (rgb) {
    const alpha = rgb[4] === undefined ? 1 : Number(rgb[4]) / (rgb[5] ? 100 : 1);
    return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3]), alpha];
  }
  const colorMix = /^color-mix\(\s*in\s+([\w-]+)\s*,(.*)\)$/s.exec(text);
  if (colorMix) {
    const [first, second] = args(colorMix[2]);
    return mix(colorMix[1], first, second, vars);
  }
  throw new Error(`no colour in "${text}"`);
}
