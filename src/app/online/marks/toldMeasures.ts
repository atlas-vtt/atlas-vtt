/**
 * What a told measurement is compared and drawn by: whether one told again is the same drawing,
 * the colour it is drawn in, an aura as the kept circle Atlas places around a token, and the
 * drawings a sender's measurements have.
 */

import type { PlacedAura } from '../../measure/auraArea';
import type { KeptAura, Measurement } from '../../measure/measureTypes';
import type { DrawnMeasure } from '../../pixi/measure/DrawnMeasure';
import type { ToldMeasure } from './measureWords.ts';
import type { PointerTrack } from './PointerTrack.ts';

type Point = Measurement['points'][number];

/** A kept measurement and its drawing. */
export interface Kept {
  told: ToldMeasure;
  /** The measurement as the aura it is, for `placeAura`; null for every other measurement. */
  follower: KeptAura | null;
  /** Where the aura was last laid around its token; null while its token is drawn nowhere. */
  placed: PlacedAura | null;
  readonly drawn: DrawnMeasure;
}

/** A measurement being drawn: as its sender last told it, and its end as it is drawn, a moment behind. */
export interface Live {
  told: ToldMeasure;
  readonly track: PointerTrack;
  end: Point;
  readonly drawn: DrawnMeasure;
}

/** One sender's drawings, and the colour of those that name none. */
export interface Sender {
  readonly who: string;
  readonly kept: Kept[];
  live: Live | null;
  colour: number;
}

export const colourNumber = (hex: string): number => Number.parseInt(hex.slice(1), 16);
export const samePoint = (a: Point, b: Point): boolean => a.x === b.x && a.y === b.y;
export const samePoints = (a: readonly Point[], b: readonly Point[]): boolean => a.length === b.length && a.every((point, index) => samePoint(point, b[index]!));

/** Whether two told measurements look alike wherever they lie: shape, width, walls, own colour, effect and the token an aura lies around. */
export const sameLook = (a: ToldMeasure, b: ToldMeasure): boolean =>
  a.shape === b.shape && a.width === b.width && a.walls === b.walls && a.color === b.color && a.effect === b.effect
  && a.aura?.token === b.aura?.token && a.aura?.reach === b.aura?.reach;

export const sameTold = (a: ToldMeasure, b: ToldMeasure): boolean => sameLook(a, b) && samePoints(a.points, b.points);
export const endOf = ({ points }: ToldMeasure): Point => points[points.length - 1] ?? { x: 0, y: 0 };
export const fixedOf = ({ points }: ToldMeasure): readonly Point[] => points.slice(0, -1);

/** Whether `next` is `live` told again, its end moved on or its corners others: the same shape from the same start. */
export const sameMeasurement = (live: ToldMeasure, next: ToldMeasure): boolean =>
  live.shape === next.shape && live.points[0] !== undefined && next.points[0] !== undefined && samePoint(live.points[0], next.points[0]);

/** The colour a told measurement is drawn in: its own, else its sender's. */
export const colourOf = ({ color }: ToldMeasure, sender: number): number => (color === undefined ? sender : colourNumber(color));

/**
 * A told aura as the kept circle `placeAura` lays around a token: its points say which way its
 * label and far end face, its reach how far it goes. Null for a measurement that is no aura.
 */
export function followerOf({ shape, points, aura }: ToldMeasure): KeptAura | null {
  if (!aura || shape !== 'circle') return null;
  return { id: `told:${aura.token}`, kind: 'measure', shape, points: points.map(({ x, y }) => ({ x, y })), follows: aura.token, aura: aura.reach };
}
