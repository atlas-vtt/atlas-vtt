/**
 * **Card stock dyed in a colour**: the ground of a die in a colour of its own.
 *
 * The light dice show the card as it is, and its life is in the lightness:
 * mottling, specks and a darker stain here and there, a few steps of
 * lightness either way. Laying a colour over the card with a blend mode lost
 * that: soft light and overlay leave a layer near middle grey almost
 * untouched, so a coloured die came out as flat as plastic.
 *
 * So the card's lightness is moved onto the colour instead. Each pixel of the
 * card is read as its distance from the card's mean in CIE L* (perceived
 * lightness), and the dyed pixel is the body colour at that distance from the
 * body's own L*, with the body's hue kept: its linear channels scaled
 * together. The steps are perceived steps, so a speck reads as a speck on a
 * near-black body as on bone, where a linear multiply would leave nothing
 * visible on black.
 *
 * The steps are scaled by the body's lightness (`grainGain`) so that a die
 * shows as much grain on screen as the light die does: the stage's light and
 * its filmic tone curve squeeze the steps of dark bodies into few tones of the
 * screen and those of light bodies into its shoulder, where bone came out as
 * plain white; middle tones lie on the steep part of the curve and take a
 * little less than the card.
 *
 * The colour the card is dyed in is the body colour as the soft-light grain
 * left it on average (`tintedGround`): a little warmed by the paper, so every
 * look keeps the colour it had and only gains its texture.
 */

import { getDomHost } from '../host/dom';
import type { Rgb } from './diceLook';

/** The card's L* in quarter steps: fine enough for the card's few steps, small enough for a table. */
const STEPS_PER_L = 4;
const LEVELS = 100 * STEPS_PER_L + 1;
/** The least luminance a body is dyed from: a pure black body still shows the card's lightness. */
const MIN_BODY_Y = 0.004;
/** How strongly the paper's own colour warms the body, as the soft-light grain did. */
const PAPER_WARMTH = 0.55;

/**
 * How far the card's lightness carries onto a body of this L*, measured on
 * the stage: the grain on screen of each set colour against the light die's.
 */
function grainGain(bodyL: number): number {
  const dark = Math.max(0, (30 - bodyL) / 18);
  const light = Math.max(0, (bodyL - 50) / 37);
  return 0.85 + Math.min(1, dark) + 2.2 * light * light;
}

interface CardLightness {
  /** L* per pixel, in quarter steps. */
  levels: Uint16Array;
  /** The card's mean L*. */
  mean: number;
  /** The card's mean colour, as bytes. */
  colour: Rgb;
  width: number;
  height: number;
}

const lightnessOf = new WeakMap<HTMLImageElement, CardLightness | null>();

function toLinear(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function toSrgbByte(linear: number): number {
  const c = Math.min(1, Math.max(0, linear));
  const srgb = c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055;
  return Math.round(srgb * 255);
}

function luminance(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** CIE L* of a relative luminance. */
function lightnessFromY(y: number): number {
  return y > 216 / 24389 ? 116 * Math.cbrt(y) - 16 : (24389 / 27) * y;
}

function yFromLightness(l: number): number {
  return l > 8 ? ((l + 16) / 116) ** 3 : (l * 27) / 24389;
}

const LINEAR = Array.from({ length: 256 }, (_, i) => toLinear(i));

/**
 * Reads the card's lightness ahead (some 15 ms, once per image), so the first
 * coloured die is not the one that pays for it in the frame it is thrown.
 */
export function prepareDye(card: HTMLImageElement): void {
  readLightness(card);
}

/** The card's lightness, read once per image; null where its pixels cannot be read. */
function readLightness(card: HTMLImageElement): CardLightness | null {
  if (lightnessOf.has(card)) return lightnessOf.get(card)!;
  const canvas = getDomHost().createCanvas(undefined, { width: card.width, height: card.height });
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  let read: CardLightness | null = null;
  if (ctx) {
    ctx.drawImage(card, 0, 0);
    const { data } = ctx.getImageData(0, 0, card.width, card.height);
    const levels = new Uint16Array(card.width * card.height);
    let sum = 0;
    let [sumR, sumG, sumB] = [0, 0, 0];
    for (let i = 0; i < levels.length; i++) {
      const [r, g, b] = [data[i * 4]!, data[i * 4 + 1]!, data[i * 4 + 2]!];
      const l = lightnessFromY(luminance(LINEAR[r]!, LINEAR[g]!, LINEAR[b]!));
      levels[i] = Math.round(l * STEPS_PER_L);
      sum += l;
      sumR += r;
      sumG += g;
      sumB += b;
    }
    const n = levels.length;
    const colour: Rgb = [sumR / n, sumG / n, sumB / n];
    read = { levels, mean: sum / n, colour, width: card.width, height: card.height };
  }
  lightnessOf.set(card, read);
  return read;
}

/** The canvas' `soft-light` of one channel (0 to 1): `source` lit onto `backdrop`. */
function softLight(backdrop: number, source: number): number {
  if (source <= 0.5) return backdrop - (1 - 2 * source) * backdrop * (1 - backdrop);
  const d = backdrop <= 0.25 ? ((16 * backdrop - 12) * backdrop + 4) * backdrop : Math.sqrt(backdrop);
  return backdrop + (2 * source - 1) * (d - backdrop);
}

/** The body colour warmed by the paper, as bytes: what the soft-light grain made of it on average. */
function tintedGround(body: Rgb, paper: Rgb): Rgb {
  const channel = (c: number): number => {
    const lit = softLight(body[c]! / 255, paper[c]! / 255) * 255;
    return Math.round(body[c]! + (lit - body[c]!) * PAPER_WARMTH);
  };
  return [channel(0), channel(1), channel(2)];
}

/** The dyed colour, as RGB bytes, for every card lightness level. */
function dyeTable(body: Rgb, cardMean: number): Uint8ClampedArray {
  const lifted = Math.max(0, MIN_BODY_Y - luminance(LINEAR[body[0]]!, LINEAR[body[1]]!, LINEAR[body[2]]!));
  const linear = body.map((channel) => LINEAR[channel]! + lifted);
  const bodyY = luminance(linear[0]!, linear[1]!, linear[2]!);
  const bodyL = lightnessFromY(bodyY);
  const gain = grainGain(bodyL);
  const table = new Uint8ClampedArray(LEVELS * 3);
  for (let level = 0; level < LEVELS; level++) {
    const target = Math.min(100, Math.max(0, bodyL + gain * (level / STEPS_PER_L - cardMean)));
    const scale = yFromLightness(target) / bodyY;
    for (let c = 0; c < 3; c++) table[level * 3 + c] = toSrgbByte(linear[c]! * scale);
  }
  return table;
}

/**
 * The card stock dyed in `body` (`[r, g, b]` bytes), as large as the card;
 * null where the card's pixels cannot be read.
 */
export function dyeCard(card: HTMLImageElement, body: Rgb): HTMLCanvasElement | null {
  const lightness = readLightness(card);
  if (lightness === null) return null;
  const { levels, mean, colour, width, height } = lightness;
  const canvas = getDomHost().createCanvas(undefined, { width, height });
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const table = dyeTable(tintedGround(body, colour), mean);
  const image = ctx.createImageData(width, height);
  const out = image.data;
  for (let i = 0; i < levels.length; i++) {
    const at = levels[i]! * 3;
    out[i * 4] = table[at]!;
    out[i * 4 + 1] = table[at + 1]!;
    out[i * 4 + 2] = table[at + 2]!;
    out[i * 4 + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}
