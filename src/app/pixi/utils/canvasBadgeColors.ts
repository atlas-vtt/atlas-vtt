import { cssColorToHexNumber, getObsidianAccentColor } from './colorUtils';

export interface CanvasBadgeColors {
  background: number;
  /** Border and text colour. */
  stroke: number;
}

export function isDarkTheme(): boolean {
  return document.body.classList.contains('theme-dark');
}

/**
 * Calls `redraw` whenever Obsidian switches between its light and dark theme; returns what stops it.
 * The body's classes change for much else (focus, panels, Atlas' own), which must not redraw.
 */
export function watchDarkTheme(redraw: () => void): () => void {
  let dark = isDarkTheme();
  const observer = new MutationObserver(() => {
    if (isDarkTheme() === dark) return;
    dark = isDarkTheme();
    redraw();
  });
  observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
  return () => observer.disconnect();
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
