/**
 * How a text is lettered: the face it is set in, as a canvas and a stylesheet name it, and the
 * halo of the Outline look. Pure; whoever draws a text (the map, the field it is typed in) reads
 * its look here, so they agree.
 */

import { FONT_FAMILIES } from './madeText';

/** What of a text says which glyphs it is set in. */
export interface TextFace {
  readonly fontFamily: string;
  readonly fontSize: number;
  readonly bold: boolean;
  readonly italic: boolean;
}

const GENERIC_FAMILIES = new Set(['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui', 'ui-serif', 'ui-sans-serif', 'ui-monospace', 'ui-rounded']);

/** The names of a `fontFamily`, each without its quotes. */
function familyNames(fontFamily: string): string[] {
  return fontFamily.split(',').map((name) => name.trim().replace(/^(['"])(.*)\1$/, '$2')).filter((name) => name !== '');
}

/** `fontFamily` as a stylesheet takes it: every name quoted but the generic ones. */
export function cssFontFamily(fontFamily: string): string {
  return familyNames(fontFamily).map((name) => (GENERIC_FAMILIES.has(name.toLowerCase()) ? name : `"${name.replace(/["\\]/g, '')}"`)).join(', ');
}

/** The face as a canvas's `font` and a stylesheet's `font` shorthand name it. */
export function cssFont(face: TextFace): string {
  return `${face.italic ? 'italic' : 'normal'} ${face.bold ? 'bold' : 'normal'} ${face.fontSize}px ${cssFontFamily(face.fontFamily)}`;
}

const BUNDLED = new Map(Object.values(FONT_FAMILIES).map((family) => [family.toLowerCase(), family]));

/**
 * The bundled face `fontFamily` asks for first, by the name its `@font-face` rule declares; null
 * for a family the device brings itself. A bundled face must be loaded before a text is measured
 * or drawn in it.
 */
export function bundledFamily(fontFamily: string): string | null {
  const first = familyNames(fontFamily)[0];
  return (first !== undefined && BUNDLED.get(first.toLowerCase())) || null;
}

/** The Outline look's halo. */
export const HALO = {
  /** How far it stands out from the glyphs, as a share of the font size. */
  share: 0.05,
  /** Under light text, and under dark text. */
  dark: '#15120f',
  light: '#f7f1e3',
  alpha: 0.85,
  /** A text less than this many pixels high on a picture is drawn without it: a halo thinner than half a pixel only smears. */
  minPixels: 12,
} as const;

/** A halo as it is drawn: a line of `width` centred on the glyphs' outlines, under their fill, so half of it shows. */
export interface TextHalo {
  /** '#rrggbb'. */
  readonly color: string;
  readonly alpha: number;
  readonly width: number;
}

/** The relative luminance of '#rrggbb', 0 (black) to 1 (white); 1 for anything else, as an unread colour draws white. */
export function luminance(color: string): number {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(color);
  if (!match) return 1;
  const [r, g, b] = [match[1]!, match[2]!, match[3]!].map((hex) => {
    const share = parseInt(hex, 16) / 255;
    return share <= 0.04045 ? share / 12.92 : ((share + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** The luminance from which a colour counts as light: where black and white stand out from it alike. */
const LIGHT_FROM = 0.179;

/** The halo of a text of `color` and `fontSize`: dark under light text, light under dark. */
export function haloOf(color: string, fontSize: number): TextHalo {
  return { color: luminance(color) >= LIGHT_FROM ? HALO.dark : HALO.light, alpha: HALO.alpha, width: 2 * HALO.share * fontSize };
}

/** Whether a text that is `pixels` high on a picture carries its halo there. */
export function carriesHalo(pixels: number): boolean {
  return pixels >= HALO.minPixels;
}
