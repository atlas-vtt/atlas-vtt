import { mixColours } from '../palette';
import type { ArtScene } from '../art/artScene';

/**
 * Engraved's means: one ink, burin lines a little apart (never closer than the picture can hold),
 * and the colours the lines are cut over. A dark look cuts light lines into its dark paper.
 */
export interface Pens {
  ink: string;
  /** What shade is cut in: the ink, or a deeper paper on a dark look. */
  shade: string;
  floor: string;
  /** Between two lines of a hatch, in cells. */
  spacing: number;
  /** Narrower than this a line is not cut, in cells. */
  minWidth: number;
  /** The step along a line, in cells. */
  step: number;
  /** The angle every hatch is cut at, radians on screen. */
  angle: number;
  mono: boolean;
  /** Water's pale tint; the floor's own colour in monochrome. */
  water: string;
}

export const LINE_ANGLE = -Math.PI / 4;

export function pensOf(scene: ArtScene): Pens {
  const { palette, view } = scene.env;
  const ppc = scene.frame.pxPerCell;
  return {
    ink: palette.ink,
    shade: palette.ink,
    floor: palette.floor,
    spacing: Math.max(0.046, 3.2 / ppc),
    minWidth: 0.5 / ppc,
    step: Math.min(0.03, 5 / ppc),
    angle: LINE_ANGLE,
    mono: view.monochrome,
    water: view.monochrome ? palette.floor : mixColours(palette.floor, palette.water, 0.5),
  };
}
