/**
 * Measurements as data: the geometry of one, a kept one as the scene object it is, and the measure
 * tool's choices. Pure types and limits, shared with whatever draws or sends them.
 */

import type { LightEmission } from '../types/lightingTypes';
import type { OnOneLevel } from '../types/sceneLevelTypes';
import type { Point } from '../types/visionTypes';
import type { MeasureEffect } from './measureEffects';

/** What a measurement is drawn as. A ruler is a path with corners; the others are areas. */
export type MeasureShapeKind = 'ruler' | 'circle' | 'cone' | 'square' | 'line';

export const MEASURE_SHAPES: readonly MeasureShapeKind[] = ['ruler', 'circle', 'cone', 'square', 'line'];

/** The points a ruler may run through: its start, corners and end. A file with more is no measurement. */
export const MAX_RULER_POINTS = 64;
/** The kept measurements one level may have, and the most a list reads: a damaged file must not hold more for the layer to draw. */
export const MAX_MEASURES = 256;
/** The tokens a measurement may start on (`KeptMeasure.origin`). */
export const MAX_ORIGIN_TOKENS = 64;
/** The longest name of who made a measurement (`KeptMeasure.by`). */
export const MAX_MEASURE_AUTHOR = 128;
/** The farthest an aura reaches from its token's space (`KeptMeasure.aura`), in game units. */
export const MAX_AURA = 100_000;

export interface Measurement {
  readonly shape: MeasureShapeKind;
  /** World pixels. A ruler: its start, corners and end. An area: origin and end. */
  readonly points: readonly Point[];
  /** A line's width, world pixels. */
  readonly width?: number;
}

/**
 * Where a kept measurement started, as it is saved: the tokens under its start, by the scene's own
 * token ids, and whether the players did not see one of them then. A `MeasureOrigin`
 * (`vision/measureOrigin.ts`) in the store's shape, so `measureShownToPlayers` reads it as it is.
 */
export interface KeptMeasureOrigin {
  tokenIds: string[];
  unseenAtStart: boolean;
}

/**
 * A measurement that stays on the map: a scene object in `objects.measures`, saved, undo-tracked,
 * moved with the map and on one level. Read them with `measureList`.
 */
export interface KeptMeasure extends Measurement, OnOneLevel {
  id: string;
  kind: 'measure';
  /** A `Measurement`'s points as the store holds them: a list its writes may replace. */
  points: Point[];
  /** '#rrggbb'; unset is the theme's accent, as a measurement always was. */
  color?: string;
  /** Only the GM sees it. Unset: players see it. */
  hidden?: true;
  /** The online player who made it; unset is the GM. */
  by?: string;
  /**
   * The tokens under its start and whether the players saw every one of them then
   * (`measureOriginOf`): it leaves the players' picture with them (`measureShownToPlayers`).
   * Unset: it started on no token.
   */
  origin?: KeptMeasureOrigin;
  /** An area that walls do not stop. Unset: it stops at walls, as every area does when it is made. */
  walls?: false;
  /**
   * The token (its id) a circle follows: an aura. It lies around that token wherever the token
   * stands, drawn from the token's place and never written when the token moves, so its `points`
   * are where it lay when it was last edited. Only with `aura`.
   */
  follows?: string;
  /**
   * How far an aura reaches from the edge of its token's space, in game units: the token may
   * grow or shrink and its aura still reaches as far. Only with `follows`.
   */
  aura?: number;
  /**
   * The light an area gives, in the engine's own words; unset, none. Where it shines from and how
   * (a point, a beam, the whole area, a darkness) is the area's shape: read it with `measureLights`.
   */
  light?: LightEmission;
  /** The look an area is drawn with, in its own colour; unset, the plain wash. */
  effect?: MeasureEffect;
}

/** A kept circle that follows a token. */
export type KeptAura = KeptMeasure & { shape: 'circle'; follows: string; aura: number };

export type MeasureInput = Omit<KeptMeasure, 'id' | 'kind'>;

/** Changes to a kept measurement: a field given as undefined is removed. */
export type MeasureChanges = { [Field in keyof MeasureInput]?: MeasureInput[Field] | undefined };

/** What the measure tool does with a press: one of the shapes, or labelled rings around a point. */
export type MeasureMode = MeasureShapeKind | 'ranges';

/** The measure tool's choices, held in the view's store: the bar above the toolbar sets them, the tool reads them. */
export interface MeasureToolOptions {
  mode: MeasureMode;
  /** A released measurement stays on the map. */
  keep: boolean;
  /** Players see what is measured and kept. */
  players: boolean;
  /** '#rrggbb' of the next measurement; null is the theme's accent. */
  color: string | null;
  /** How wide the next line is, in cells: the width the last line was given. */
  lineWidth: number;
  /** The look the next kept area takes, with the light it starts with; null is none. */
  effect: MeasureEffect | null;
}

/** The widest a line is made with the tool or its popover, in cells. */
export const MAX_LINE_WIDTH = 20;

export const DEFAULT_MEASURE_TOOL: MeasureToolOptions = { mode: 'ruler', keep: false, players: true, color: null, lineWidth: 1, effect: null };
