/**
 * What a token's drag reads as under the collection's movement rules: the step the moved
 * distance lies in, which colours the drag line, and the label that sets the distance against
 * the token's speed. Where the rules name no step or the token has no speed, a drag reads as
 * it always did: its distance alone.
 */

import { distanceNumber, formatGameUnits, type MeasurementSettings } from '../grid/measurementFormat';
import { movementStepFor, type MovementRules } from './movementRules';

/** The colour of a move past the last step: no step's own, so whoever draws it reads the theme's warning red. */
export const BEYOND_SPEED = 'beyond';

/** A step's `#rrggbb`, or `BEYOND_SPEED`. */
export type MoveColor = string;

export interface DragMove {
  /** Moved and speed, "25 / 30ft": the moved part holds the turn's earlier moves where they count. */
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
  readonly settings: Pick<MeasurementSettings, 'mode' | 'unitType' | 'unitDistance' | 'unitName'>;
}

/** The game units a path of `cells` grid cells spans on the map; none where the map measures in range bands. */
export function movedGameUnits(cells: number, settings: Pick<MeasurementSettings, 'mode' | 'unitDistance'>): number | null {
  if (settings.mode === 'abstract') return null;
  const units = cells * settings.unitDistance;
  return Number.isFinite(units) ? units : null;
}

/**
 * How a drag of `cells` reads against the token's speed, or null where it reads as a plain
 * distance: rules without steps, a token without a speed, or a map that measures in range bands,
 * whose bands are its steps already.
 */
export function dragMove({ cells, earlier, speed, rules, settings }: DragMoveInput): DragMove | null {
  const dragged = movedGameUnits(cells, settings);
  if (dragged === null || speed === null) return null;
  const moved = dragged + (earlier > 0 && Number.isFinite(earlier) ? earlier : 0);
  const step = movementStepFor(moved, speed, rules);
  if (step === null) return null;
  return {
    label: `${distanceNumber(moved)} / ${formatGameUnits(speed, settings)}`,
    color: step === BEYOND_SPEED ? BEYOND_SPEED : step.color,
  };
}
