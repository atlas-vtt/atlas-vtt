/** How the dice look: the colour of their body and the face of their numerals. */

import { COLOUR_PRESETS, type ColourPresetId } from '../appearance/colourPresets';
import { t } from '../i18n';

/**
 * `light` is card stock with graphite numerals, `dark` the reverse, `accent` Obsidian's accent colour, and a preset's
 * id the card dyed in that colour of the Appearance page.
 */
export type DiceColour = 'light' | 'dark' | 'accent' | ColourPresetId;
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
  ...COLOUR_PRESETS.map((preset) => ({ value: preset.id, label: t(preset.labelKey) })),
];

/** The body colour of a preset's dice. */
export function presetDiceHex(colour: ColourPresetId): string {
  return COLOUR_PRESETS.find((preset) => preset.id === colour)?.hex ?? COLOUR_PRESETS[0].hex;
}

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

/** `#rrggbb` to channels; null for anything else. */
export function parseHex(hex: string): Rgb | null {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim());
  return match ? [parseInt(match[1]!, 16), parseInt(match[2]!, 16), parseInt(match[3]!, 16)] : null;
}
