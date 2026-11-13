/**
 * What a token's drag reads as under the collection's movement rules: the step the moved
 * distance lies in, which colours the drag line, and the label that sets the distance against
 * how far that step lets the token go. Where the rules name no step or the token has no speed, a
 * drag reads as it always did: its distance alone. A map that measures in range bands counts as
 * any other (cells times the distance per cell) and writes both as the bands they reach.
 */

import { distanceNumber, formatGameUnits, rangeBandName, type MeasurementSettings } from '../grid/measurementFormat';
import { movementStepFor, stepReach, type MovementRules } from './movementRules';

/** The colour of a move past the last step: no step's own, so whoever draws it reads the theme's warning red. */
export const BEYOND_SPEED = 'beyond';

/** A step's `#rrggbb`, or `BEYOND_SPEED`. */
export type MoveColor = string;

export interface DragMove {
  /**
   * Moved and how far the step it lies in reaches, "25 / 30ft", "45 / 60ft" in a second move,
   * "Close / Near" where the map names distances. The moved part holds the turn's earlier moves
   * where they count; past the last step the reach is the last step's.
   */
  readonly label: string;
  readonly color: MoveColor;
}

export interface DragMoveInput {
  /** What the drag costs so far, in grid cells, as its label would show it. */
  readonly cells: number;
  /** Game units the token has moved in the running turn before this drag; 0 where movement does not add up. */
  readonly earlier: number;
  /** The token's speed in game units; null without one. */
  readonly speed: number | null;
  readonly rules: MovementRules | undefined;
  readonly settings: MoveSettings;
}

/** What says how a move is counted and written. */
export type MoveSettings = Pick<MeasurementSettings, 'mode' | 'unitType' | 'unitDistance' | 'unitName' | 'rangeBands'>;

/**
 * The game units a path of `cells` grid cells spans on the map, range bands included: a band's
 * cells span the collection's distance per cell. None where a cell spans no distance.
 */
export function movedGameUnits(cells: number, settings: Pick<MeasurementSettings, 'unitDistance'>): number | null {
  const units = cells * settings.unitDistance;
  return Number.isFinite(units) && settings.unitDistance > 0 ? units : null;
}

/** Moved against reach as the map writes distances: numbers with the unit once, or the two bands. */
function moveLabel(moved: number, reach: number, settings: MoveSettings): string {
  if (settings.mode !== 'abstract') return `${distanceNumber(moved)} / ${formatGameUnits(reach, settings)}`;
  const band = (units: number): string => rangeBandName(units / settings.unitDistance, settings.rangeBands);
  return `${band(moved)} / ${band(reach)}`;
}

/**
 * How a drag of `cells` reads against the token's speed, or null where it reads as a plain
 * distance: rules without steps or a token without a speed.
 */
export function dragMove({ cells, earlier, speed, rules, settings }: DragMoveInput): DragMove | null {
  const dragged = movedGameUnits(cells, settings);
  if (dragged === null || speed === null || !rules) return null;
  const moved = dragged + (earlier > 0 && Number.isFinite(earlier) ? earlier : 0);
  const step = movementStepFor(moved, speed, rules);
  const reach = stepReach(step, speed, rules);
  if (step === null || reach === null) return null;
  return {
    label: moveLabel(moved, reach, settings),
    color: step === BEYOND_SPEED ? BEYOND_SPEED : step.color,
  };
}
