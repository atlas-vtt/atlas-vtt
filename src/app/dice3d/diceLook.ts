/** How the dice look: the colour of their body and the face of their numerals. */

import { t } from '../i18n';

/** `light` is card stock with graphite numerals, `dark` the reverse, `accent` Obsidian's accent colour. */
export type DiceColour = 'light' | 'dark' | 'accent';
/** `medieval` is the pencil-drawn numeral sheet, `scifi` numerals set in Oxanium. */
export type DiceFont = 'medieval' | 'scifi';

export interface DiceLook {
  colour: DiceColour;
  font: DiceFont;
}

export const DEFAULT_DICE_LOOK: Readonly<DiceLook> = { colour: 'light', font: 'medieval' };

export const DICE_COLOUR_OPTIONS: readonly { value: DiceColour; label: string }[] = [
  { value: 'light', label: t('diceSettings.colour.light') },
  { value: 'dark', label: t('diceSettings.colour.dark') },
  { value: 'accent', label: t('diceSettings.colour.accent') },
];

export const DICE_FONT_OPTIONS: readonly { value: DiceFont; label: string }[] = [
  { value: 'medieval', label: t('diceSettings.font.medieval') },
  { value: 'scifi', label: t('diceSettings.font.scifi') },
];

export function isDiceColour(value: unknown): value is DiceColour {
  return DICE_COLOUR_OPTIONS.some((option) => option.value === value);
}

export function isDiceFont(value: unknown): value is DiceFont {
  return DICE_FONT_OPTIONS.some((option) => option.value === value);
}

export type Rgb = readonly [number, number, number];

/** Numerals on a dark body. */
export const LIGHT_INK = '#e2e8f0';
/** Numerals on a light body, where no pencil drawing supplies its own tone. */
export const DARK_INK = '#1c1714';

/**
 * Perceived brightness (the YIQ weighting), 0 to 255. Chosen over the WCAG
 * contrast ratio, which prefers black on every saturated mid-tone: it would
 * write black numerals on Obsidian's own purple, where Obsidian writes white.
 */
function brightness([r, g, b]: Rgb): number {
  return (r * 299 + g * 587 + b * 114) / 1000;
}

/** Above this a body reads as light and takes dark numerals. */
const LIGHT_BODY = 150;

/** The numeral colour that reads best on a body of this colour: dark ink on light bodies, light ink otherwise. */
export function readableInk(body: Rgb): string {
  return brightness(body) > LIGHT_BODY ? DARK_INK : LIGHT_INK;
}

/** `#rrggbb` to channels; null for anything else. */
export function parseHex(hex: string): Rgb | null {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim());
  return match ? [parseInt(match[1]!, 16), parseInt(match[2]!, 16), parseInt(match[3]!, 16)] : null;
}
