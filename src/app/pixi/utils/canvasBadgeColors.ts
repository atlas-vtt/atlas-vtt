import { cssColorToHexNumber, getObsidianAccentColor } from './colorUtils';

export interface CanvasBadgeColors {
  background: number;
  /** Border and text colour. */
  stroke: number;
}

export function isDarkTheme(): boolean {
  return document.body.classList.contains('theme-dark');
}

/** Colours of canvas badges such as pins and hex labels; they match the token UI badges (HP bar background). */
export function canvasBadgeColors(): CanvasBadgeColors {
  return isDarkTheme()
    ? { background: 0x2a2a2a, stroke: 0xffffff }
    : { background: 0xe3e3e3, stroke: 0x000000 };
}

/** The badge colours and the theme's accent: what markers and areas the GM edits on the map are drawn in. */
export interface CanvasBadgeTheme extends CanvasBadgeColors {
  accent: number;
}

export function canvasBadgeTheme(): CanvasBadgeTheme {
  return { ...canvasBadgeColors(), accent: cssColorToHexNumber(getObsidianAccentColor()) };
}
