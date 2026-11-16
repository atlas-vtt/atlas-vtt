import { luminance, mixColours, parseHex, type Palette } from '../palette';

/**
 * The colours of Stone & shadow in a look: the materials a dungeon is built of, worked out from the
 * look's ink, rock, floor, water and paper. Monochrome is a duotone: every colour a tone between
 * the ink and the look's other colour, so the picture still models light and shade in two inks.
 */
export interface StoneColours {
  /** The crisp line where wall meets floor. */
  line: string;
  rock: string;
  /** The course of dressed blocks lining every room. */
  band: string;
  floor: string;
  /** The top of a raised floor: nearer the light than the floor round it. */
  raised: string;
  /** Between the flagstones. */
  joint: string;
  wood: string;
  stone: string;
  metal: string;
  cloth: string;
  water: string;
  /** What shadows darken towards. */
  shadow: string;
  /** What a lit edge lightens towards. */
  light: string;
  dark: boolean;
  mono: boolean;
}

/** Below this luminance (0..255) a floor is dark: light catches its edges less, shadows go to black. */
const DARK_FLOOR = 0.4 * 255;

export function isDarkColour(colour: string): boolean {
  return luminance(parseHex(colour)) < DARK_FLOOR;
}

export function stoneColours(palette: Palette, mono: boolean): StoneColours {
  const { ink, floor } = palette;
  const dark = isDarkColour(floor);
  if (mono) {
    const tone = (t: number): string => mixColours(floor, ink, t);
    return { line: ink, rock: tone(0.32), band: tone(0.16), floor, raised: dark ? tone(0.12) : floor, joint: tone(0.1), wood: tone(0.38), stone: tone(0.1), metal: tone(0.55), cloth: tone(0.45), water: tone(0.14), shadow: ink, light: dark ? ink : '#ffffff', dark, mono };
  }
  if (dark) {
    return {
      line: ink,
      rock: palette.rock,
      band: mixColours(floor, ink, 0.14),
      floor,
      raised: mixColours(floor, ink, 0.12),
      joint: mixColours(floor, '#000000', 0.32),
      wood: mixColours(mixColours(floor, '#7a5232', 0.5), ink, 0.06),
      stone: mixColours(floor, ink, 0.22),
      metal: mixColours(floor, ink, 0.4),
      cloth: mixColours(floor, '#8a2f2f', 0.5),
      water: palette.water,
      shadow: palette.shadow ?? '#000000',
      light: ink,
      dark,
      mono,
    };
  }
  return {
    line: ink,
    rock: palette.rock,
    band: mixColours(floor, palette.rock, 0.42),
    floor,
    raised: mixColours(floor, '#ffffff', 0.3),
    joint: mixColours(floor, ink, 0.13),
    wood: mixColours(mixColours('#8a5a34', floor, 0.3), ink, 0.08),
    stone: mixColours(floor, ink, 0.1),
    metal: mixColours(floor, '#3a3d42', 0.6),
    cloth: mixColours('#7d2a26', floor, 0.15),
    water: palette.water,
    shadow: palette.shadow ?? ink,
    light: '#ffffff',
    dark,
    mono,
  };
}
