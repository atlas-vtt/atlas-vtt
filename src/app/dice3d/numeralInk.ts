/**
 * **The ink of a coloured die's numerals**, chosen on the face as the stage
 * shows it (`stageTone.ts`), not on the colour the die was given: judged on
 * the colour itself, teal and violet took light numerals that the stage then
 * showed at 1.4:1 against their face.
 *
 * The dark ink is the body's own hue taken deep, not black: black numerals on
 * a pastel die read as print on a sticker. It is the lightest shade that still
 * reads at `TARGET`, so a pastel keeps a coloured ink and a strong red takes
 * one near black.
 */

import { LIGHT_INK, parseHex, type Rgb } from './diceLook';
import { linearOf, luminance, shownContrast } from './stageTone';

/** WCAG AA for text of any size, which the dark ink aims for. */
const TARGET = 4.5;
/**
 * WCAG AA for large text: a lone die's numerals stand some 29 px tall on the
 * roll stage. Light ink that reaches it stays, so a dark die keeps its light
 * numerals.
 */
const LIGHT_READS = 3;
/** The darkest and lightest the dark ink is painted, in luminance: near black, and dark enough to stay ink. */
const DEEPEST_SHADE = 0.005;
const LIGHTEST_SHADE = 0.03;
const LIGHT = parseHex(LIGHT_INK) as Rgb;

function toByte(linear: number): number {
  const c = Math.min(1, Math.max(0, linear));
  return Math.round((c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055) * 255);
}

function hex(rgb: Rgb): string {
  return `#${rgb.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
}

/** `body`'s hue at `target` luminance: its linear channels scaled together; a body darker than that as it is. */
function shade(body: Rgb, target: number): Rgb {
  const scale = Math.min(1, target / luminance(body));
  return linearOf(body).map((channel) => toByte(channel * scale)) as unknown as Rgb;
}

/** The lightest shade of `body` that reads at `TARGET` on it, or its deepest where none does. */
function deepShade(body: Rgb): Rgb {
  // `reads` is the lightest luminance known to read, or the deepest; `fails` one known not to, or the lightest.
  let [reads, fails] = [DEEPEST_SHADE, LIGHTEST_SHADE];
  if (shownContrast(shade(body, fails), body) >= TARGET) return shade(body, fails);
  for (let step = 0; step < 12; step++) {
    const middle = (reads + fails) / 2;
    if (shownContrast(shade(body, middle), body) >= TARGET) reads = middle;
    else fails = middle;
  }
  return shade(body, reads);
}

/**
 * The numeral colour of a body of this colour: light ink where it reads, as on
 * dark and deep blue dice, and the body's deep shade where it does not, which
 * then always reads better.
 */
export function readableInk(body: Rgb): string {
  return shownContrast(LIGHT, body) >= LIGHT_READS ? LIGHT_INK : hex(deepShade(body));
}
