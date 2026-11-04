/**
 * How the lab's tray lays a set's dice out: the fewer dice, the larger each is
 * drawn, so one die fills the tray and twenty still fit; and where the round
 * buttons of a die's fan sit around it.
 */

import { fanSpots, type FanSpot } from '../fan/fanArc';

/** The height a die is drawn at for the number of cells on the tray (its dice and the + socket). */
const SIZES: ReadonlyArray<{ upTo: number; size: number }> = [
  { upTo: 3, size: 136 },
  { upTo: 5, size: 112 },
  { upTo: 8, size: 96 },
  { upTo: 12, size: 80 },
  { upTo: 16, size: 64 },
];
const SMALLEST = 56;

export function dieSize(cells: number): number {
  return SIZES.find(({ upTo }) => cells <= upTo)?.size ?? SMALLEST;
}

/** Room between the die's edge and its fan's buttons. */
const FAN_GAP = 12;
/** Half a fan button (`$fan-button` in radial-fan.scss). */
const FAN_BUTTON_HALF = 17;
/** The fan's arc over the die never closer than this to its centre, so small dice keep room between buttons. */
const LEAST_FAN_RADIUS = 72;
const FAN_SPREAD_DEG = 32;

/** The fan's distance from a die's centre along a side of the die's box. */
const fanRadius = (side: number): number => Math.max(LEAST_FAN_RADIUS, side / 2 + FAN_GAP + FAN_BUTTON_HALF);

/**
 * The spots of a die's `count` fan buttons: an arc over its top, from its left
 * to its right, on a circle around a die, on an ellipse around a d100's two.
 */
export function dieFanSpots(count: number, width: number, height: number): FanSpot[] {
  return fanSpots(count, { radius: fanRadius(width), radiusY: fanRadius(height), centreDeg: -90, spreadDeg: FAN_SPREAD_DEG });
}

/** The most buttons a die's fan has (`DieFan`: sides, name, colour, copy, remove). */
const MOST_FAN_BUTTONS = 5;

/** How far a die of `width` × `height` and the fan over it reach left and right of its centre. */
export function dieFanReach(width: number, height: number): number {
  const spots = dieFanSpots(MOST_FAN_BUTTONS, width, height);
  return Math.max(width / 2, ...spots.map((spot) => Math.abs(spot.x) + FAN_BUTTON_HALF));
}
