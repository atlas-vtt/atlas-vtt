/**
 * Where a token's resource bars and nameplate sit, in UI units from the token's
 * bottom edge (the anchor `TokenUIRenderer` scales by the token UI scale), and
 * their look. Used by `TokenUIRenderer`, and part of the shared drawing contract; no PIXI imports.
 */
import { barDimensions } from '../../styles/designTokens';
import { NAMEPLATE_HEIGHT } from './tokenSizing';

export interface UiRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Gap between the token's edge and the first bar. */
export const FIRST_BAR_GAP = 2;
/** The bars' thin outer stroke; their dark inside starts at its inner edge. */
export const BAR_BORDER = 0.75;
/** A bar's fill sits this far inside its dark inside, so it looks contained. */
export const BAR_FILL_INSET = 1;
/** Tick marks every tenth of a bar. */
export const BAR_TICKS = 10;

export const BAR_STYLE = {
  border: 0x888888,
  inside: 0x1a1a1a,
  tick: 0x333333,
  tickAlpha: 0.5,
  tickWidth: 0.5,
  /** Darkens the bar whose spending defeats the token. */
  defeatedAlpha: 0.4,
} as const;

export const NAMEPLATE = {
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial',
  /** The text is set at this size and scaled by `textScale`, so it stays crisp when zoomed. */
  fontSize: 24,
  fontWeight: '600',
  textScale: 0.333,
  textAlpha: 0.85,
  padding: 6,
  minWidth: 40,
  height: NAMEPLATE_HEIGHT,
} as const;

export const NAMEPLATE_STYLE = {
  dark: { fill: 0x2a2a2a, border: 0xffffff, borderAlpha: 0.4 },
  light: { fill: 0xe3e3e3, border: 0x000000, borderAlpha: 0.3 },
  borderWidth: 0.5,
  text: 0xffffff,
} as const;

/** The rectangles of `count` bars stacked under the token, each `barDimensions.token` sized and centred, the first `FIRST_BAR_GAP` below it. */
export function barStackRects(count: number): UiRect[] {
  const { width, height, gap } = barDimensions.token;
  return Array.from({ length: count }, (_, index) => ({ x: -width / 2, y: FIRST_BAR_GAP + index * (height + gap), width, height }));
}

/** A bar's dark inside, which starts at the inner edge of its border. */
export function barInnerRect(bar: UiRect): UiRect {
  const inset = BAR_BORDER / 2;
  return { x: bar.x + inset, y: bar.y + inset, width: bar.width - inset * 2, height: bar.height - inset * 2 };
}

/** A bar's fill, inside its dark background. */
export function barFillRect(inner: UiRect): UiRect {
  const inset = BAR_FILL_INSET;
  return { x: inner.x + inset, y: inner.y + inset, width: inner.width - inset * 2, height: inner.height - inset * 2 };
}

/** The x of each tick mark inside a bar. */
export function barTickXs(inner: UiRect): number[] {
  const spacing = inner.width / BAR_TICKS;
  return Array.from({ length: BAR_TICKS - 1 }, (_, index) => inner.x + spacing * (index + 1));
}

/**
 * The nameplate's badge for a name `textWidth` wide at `NAMEPLATE.fontSize`, centred,
 * its bottom edge on the token's bottom edge; `textY` is where the text's middle goes.
 */
export function nameplateRect(textWidth: number): UiRect & { textY: number } {
  const width = Math.max(textWidth * NAMEPLATE.textScale + NAMEPLATE.padding * 2, NAMEPLATE.minWidth);
  const textY = -NAMEPLATE.height / 2;
  return { x: -width / 2, y: textY - NAMEPLATE.height / 2, width, height: NAMEPLATE.height, textY };
}
