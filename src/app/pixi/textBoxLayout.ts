/**
 * How Atlas lays out a map text, read by `TextRenderer`; pure,
 * no PIXI imports. A text is centred on its position. A background, when set, is the
 * text's measured box grown by its padding (8 when unset or 0) and filled at the text's
 * opacity; the glyphs themselves stay opaque. Atlas sizes the box to the text: `width`
 * and `height` are not used for drawing.
 */
export const DEFAULT_TEXT_PADDING = 8;
/** Line spacing in font sizes, for surfaces that cannot measure the font; part of the shared drawing contract (`@atlas-vtt/shared/draw`). */
export const TEXT_LINE_SPACING = 1.2;

export interface TextBoxSource {
  backgroundColor?: string | null | undefined;
  padding?: number | null | undefined;
  borderRadius?: number | null | undefined;
  opacity?: number | null | undefined;
}

/** The text's measured box around its centre. */
export interface TextBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TextBackground extends TextBounds {
  color: string;
  /** 0 for square corners. */
  radius: number;
  alpha: number;
}

export function textBackground(text: TextBoxSource, bounds: TextBounds): TextBackground | null {
  if (!text.backgroundColor) return null;
  const padding = text.padding || DEFAULT_TEXT_PADDING;
  return {
    x: bounds.x - padding,
    y: bounds.y - padding,
    width: bounds.width + padding * 2,
    height: bounds.height + padding * 2,
    color: text.backgroundColor,
    radius: text.borderRadius || 0,
    alpha: text.opacity || 1,
  };
}

export function textFontWeight(text: { bold?: boolean | null | undefined }): 'bold' | 'normal' {
  return text.bold ? 'bold' : 'normal';
}

export function textFontStyle(text: { italic?: boolean | null | undefined }): 'italic' | 'normal' {
  return text.italic ? 'italic' : 'normal';
}

/** The text's rotation in radians; stored in degrees. */
export function textRotation(rotation: number | null | undefined): number {
  return rotation ? (rotation * Math.PI) / 180 : 0;
}

export function textScale(scale: number | null | undefined): number {
  return scale || 1;
}
