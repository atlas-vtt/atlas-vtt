import type { DungeonStyle, DungeonView } from '../style';

/** The colours a drawing uses, after Monochrome and the Shadow layer have had their say. */
export interface Palette {
  ink: string;
  /** The natural rock round the walls. */
  rock: string;
  water: string;
  floor: string;
  paper: string;
  /** What props and rubble are filled with: the paper, or the floor where the paper is ink. */
  fill: string;
  /** The grid's lines: ink let into the floor by the style's grid strength, opaque so an SVG needs no alpha. */
  grid: string;
  /** The colour shadows darken towards; null when the view shows none. */
  shadow: string | null;
}

export type Rgb = [number, number, number];

export function parseHex(colour: string): Rgb {
  const m = /^#?([0-9a-f]{6})$/i.exec(colour.trim());
  if (!m) return [0, 0, 0];
  const n = parseInt(m[1]!, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function luminance([r, g, b]: Rgb): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** A colour with an alpha, as CSS. */
export function withAlpha(colour: string, alpha: number): string {
  const [r, g, b] = parseHex(colour);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** A colour as `#rrggbb`. */
export function hex([r, g, b]: Rgb): string {
  return `#${[r, g, b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
}

/** `a` moved towards `b` by `t` (0..1). */
export function mixColours(a: string, b: string, t: number): string {
  const from = parseHex(a);
  const to = parseHex(b);
  return hex([0, 1, 2].map(i => from[i]! + (to[i]! - from[i]!) * t) as Rgb);
}

/** Luminance apart below which paper reads as ink, as in a style whose rock is solid ink. */
const PAPER_AS_INK = 60;

/** Whether the paper is as dark or light as the ink: a style whose rock is solid ink. */
function paperIsInk(style: DungeonStyle): boolean {
  const { ink, paper } = style.colors;
  return Math.abs(luminance(parseHex(paper)) - luminance(parseHex(ink))) < PAPER_AS_INK;
}

/**
 * Monochrome is the style's ink and one other colour: its paper, or its floor where the paper is
 * ink itself. Every colour takes whichever of the two it is nearer to; water takes the floor's
 * and shows by its inked shore and ripples.
 */
function monochromeOf(style: DungeonStyle): Palette {
  const { ink } = style.colors;
  const inkL = luminance(parseHex(ink));
  const apart = (colour: string): number => Math.abs(luminance(parseHex(colour)) - inkL);
  const other = paperIsInk(style) ? style.colors.floor : style.colors.paper;
  const otherL = luminance(parseHex(other));
  const snap = (colour: string): string => (apart(colour) <= Math.abs(luminance(parseHex(colour)) - otherL) ? ink : other);
  const floor = snap(style.colors.floor);
  const paper = snap(style.colors.paper);
  return { ink, paper, fill: paper === ink ? floor : paper, rock: snap(style.colors.rock), water: floor, floor, grid: ink, shadow: null };
}

export function paletteOf(style: DungeonStyle, view: Pick<DungeonView, 'monochrome' | 'shadow'>): Palette {
  if (view.monochrome) return { ...monochromeOf(style), shadow: view.shadow ? style.colors.ink : null };
  const { ink } = style.colors;
  const shadow = view.shadow ? style.shadow.color : null;
  const grid = mixColours(style.colors.floor, ink, style.grid.strength);
  const fill = paperIsInk(style) ? style.colors.floor : style.colors.paper;
  return { ...style.colors, fill, grid, shadow };
}
