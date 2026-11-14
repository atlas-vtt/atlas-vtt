/**
 * A measurement between Atlas's words and the protocol's. Atlas says a shape and its points, with
 * a line's width, and of an area whether walls stop it; the protocol says that in full
 * (`FullMeasure`), and beside it what every reader knows: a line, a circle or a cone between two
 * points (`SharedMeasure`). What only a GM's kept measurement has goes in full alone: its own
 * colour, its effect, and the token an aura lies around.
 */

import { MARK_EFFECTS, MAX_AURA_REACH, MAX_COORDINATE, MAX_RULER_NUMBERS, TOKEN_ID_PATTERN, type FullMeasure, type FullMeasures, type MarkAura, type MarkPoint, type MeasureState, type SharedMeasure } from '../protocol/index.ts';
import { readMeasureEffect, type MeasureEffect } from '../../measure/measureEffects';
import type { Measurement } from '../../measure/measureTypes';

/** The token an aura lies around, by the id its reader knows that token by, and how far it reaches from the token's space, in game units. */
export type ToldAura = MarkAura;

/**
 * A measurement as it is drawn: what it measures, and `walls: false` on an area that walls do not
 * stop. `color` ('#rrggbb') is its own colour, where it is not its sender's; `effect` the look an
 * area's body has; `aura` is set on a circle that lies around a token, whose points then say only
 * which way it faces.
 */
export type ToldMeasure = Measurement & {
  readonly walls?: false;
  readonly color?: string;
  readonly effect?: MeasureEffect;
  readonly aura?: ToldAura;
};

/** A sender's measurements as they are drawn. */
export interface ToldMeasures {
  readonly live: ToldMeasure | null;
  readonly kept: readonly ToldMeasure[];
}

type Point = Measurement['points'][number];

const COLOUR = /^#[0-9a-f]{6}$/i;

const tenth = (value: number): number => Math.round(value * 10) / 10;
const thousandth = (value: number): number => Math.round(value * 1000) / 1000;
const onMap = (value: number): boolean => Number.isFinite(value) && Math.abs(value) <= MAX_COORDINATE;
const pointAt = (pts: readonly number[], index: number): Point => ({ x: pts[2 * index] ?? 0, y: pts[2 * index + 1] ?? 0 });
const markAt = (pts: readonly number[], index: number): MarkPoint => [pts[2 * index] ?? 0, pts[2 * index + 1] ?? 0];

/** An aura as the protocol says it; null for one it cannot say: a token id that is none, a reach that is no distance. */
function auraInFull({ token, reach }: ToldAura): MarkAura | null {
  const told = thousandth(reach);
  return TOKEN_ID_PATTERN.test(token) && told > 0 && told <= MAX_AURA_REACH ? { token, reach: told } : null;
}

/**
 * A measurement in full, its numbers to a tenth of a pixel; null for one the protocol cannot say:
 * a point off every map, fewer than two points, a ruler of more points than a message holds, an
 * aura whose token or reach cannot be said (never a circle in its place: that would stand where
 * the aura was last edited). An area is told by its origin and its end. A colour that is not
 * `#rrggbb` is left out, and so is an effect on a ruler.
 */
export function measureInFull({ shape, points, width, walls, color, effect, aura }: ToldMeasure): FullMeasure | null {
  const ruler = shape === 'ruler';
  const told = ruler ? points : [points[0], points[points.length - 1]];
  if (points.length < 2 || 2 * told.length > MAX_RULER_NUMBERS) return null;
  const pts = told.flatMap((point) => (point ? [tenth(point.x), tenth(point.y)] : []));
  if (pts.length !== 2 * told.length || !pts.every(onMap)) return null;
  const follows = aura && shape === 'circle' ? auraInFull(aura) : undefined;
  if (aura && !follows) return null;
  // A width the protocol would refuse (none left at a tenth of a pixel, or no number) is left out: the line then reads one cell wide.
  const wide = shape === 'line' && width !== undefined ? tenth(width) : 0;
  const look = ruler ? undefined : MARK_EFFECTS.find((name) => name === effect);
  return {
    shape, pts, ...(wide > 0 && onMap(wide) && { width: wide }), ...(!ruler && walls === false && { free: true as const }),
    ...(color !== undefined && COLOUR.test(color) && { color: color.toLowerCase() }), ...(look && { effect: look }), ...(follows && { aura: follows }),
  };
}

/** A measurement told in full, as Atlas draws it. */
export function measureFromFull({ shape, pts, width, free, color, effect, aura }: FullMeasure): ToldMeasure {
  const points = Array.from({ length: pts.length / 2 }, (_, index) => pointAt(pts, index));
  const look = readMeasureEffect(effect);
  return {
    shape, points, ...(width !== undefined && { width }), ...(free === true && { walls: false as const }),
    ...(color !== undefined && { color }), ...(look && { effect: look }), ...(aura && { aura }),
  };
}

/** A measurement told in full with nothing but what it measures: what a player's may say. */
export function plainMeasure({ shape, pts, width, free }: FullMeasure): FullMeasure {
  return { shape, pts, ...(width !== undefined && { width }), ...(free === true && { free }) };
}

/**
 * A measurement told in the older words, as Atlas draws it: the protocol's line is a ruler of one
 * leg, and a circle or a cone is the whole shape, which its sender drew past every wall.
 */
export function measureFromShared({ shape, a, b }: SharedMeasure): ToldMeasure {
  const points = [{ x: a[0], y: a[1] }, { x: b[0], y: b[1] }];
  return shape === 'line' ? { shape: 'ruler', points } : { shape, points, walls: false };
}

/** A sender's measurements as they are drawn: those told in full where there are any, else those in the older words. */
export function toldMeasures({ live, kept, full }: Pick<MeasureState, 'live' | 'kept' | 'full'>): ToldMeasures {
  if (full) return { live: full.live && measureFromFull(full.live), kept: full.kept.map(measureFromFull) };
  return { live: live && measureFromShared(live), kept: kept.map(measureFromShared) };
}

/**
 * A measurement in the older words: a ruler leg by leg, each leg a line, a circle and a cone as
 * themselves. None for a square, a line with a width or an aura, which those words cannot say.
 * None either for a circle or a cone that stops at walls on a level that has some (`walled`): the
 * older words say the whole shape, which would show more than its maker's own picture of it does.
 */
function legsOf({ shape, pts, free, aura }: FullMeasure, walled: boolean): SharedMeasure[] {
  // An aura lies around its token, which the older words cannot say: its points are where it was last edited.
  if (aura) return [];
  switch (shape) {
    case 'ruler':
      return Array.from({ length: pts.length / 2 - 1 }, (_, index) => ({ shape: 'line', a: markAt(pts, index), b: markAt(pts, index + 1) }));
    case 'circle':
    case 'cone':
      return walled && free !== true ? [] : [{ shape, a: markAt(pts, 0), b: markAt(pts, 1) }];
    case 'square':
    case 'line':
      return [];
  }
}

/** The same with a ruler's corners left out: one line from its start to its end. */
function straight(measure: FullMeasure, walled: boolean): SharedMeasure[] {
  const { shape, pts } = measure;
  return legsOf(shape === 'ruler' && pts.length > 4 ? { shape, pts: [...pts.slice(0, 2), ...pts.slice(-2)] } : measure, walled);
}

/**
 * Measurements told in full, in the older words, for readers that know no others. A ruler with
 * corners goes out as its legs: those before the last among the kept measurements, the last as
 * the live one, or all of them kept. Where that is more than `maxKept`, every ruler goes out as
 * one line from its start to its end, and of more than that the newest. `walled` says whether
 * walls stand on the level the measurements lie on (`legsOf`).
 */
export function legacyMeasures({ live, kept }: FullMeasures, walled: boolean, maxKept: number): Pick<MeasureState, 'live' | 'kept'> {
  const told = (legs: (measure: FullMeasure, walled: boolean) => SharedMeasure[]): Pick<MeasureState, 'live' | 'kept'> => {
    const liveLegs = live ? legs(live, walled) : [];
    return { live: liveLegs[liveLegs.length - 1] ?? null, kept: [...kept.flatMap((measure) => legs(measure, walled)), ...liveLegs.slice(0, -1)] };
  };
  const byLegs = told(legsOf);
  const { live: last, kept: rest } = byLegs.kept.length <= maxKept ? byLegs : told(straight);
  return { live: last, kept: rest.slice(-maxKept) };
}
