/**
 * A token's height above the floor of its level (`BaseToken.elevation`, game units): a flier, or
 * below 0 a swimmer or a creature in a pit. It is counted in every distance between tokens. A map
 * that measures in range bands names it as it names a distance, by the band it reaches ("↑ Close"),
 * and steps it from band to band (`steppedReach`).
 */

import { formatDistance, type MeasurementSettings } from '../grid/measurementFormat';
import type { Point } from '../types/visionTypes';
import { lengthInCells } from './measureGrid';
import { steppedReach } from './reachSteps';

/** The farthest from the floor a token is put, in game units either way. */
export const MAX_TOKEN_HEIGHT = 100_000;

/** What a height is read from. */
export interface HasHeight {
  readonly elevation?: unknown;
}

/** What says how a map counts a height: what one cell spans. */
export type HeightSettings = Pick<MeasurementSettings, 'unitDistance'>;

/** `token`'s height in game units: 0 on the floor, and for a value that is no height. */
export function tokenHeight(token: HasHeight | null | undefined): number {
  const height = token?.elevation;
  if (typeof height !== 'number' || !Number.isFinite(height)) return 0;
  return Math.max(-MAX_TOKEN_HEIGHT, Math.min(MAX_TOKEN_HEIGHT, height));
}

/** Whether the map counts heights: a cell spans a distance, by which a height is so many cells. Range bands count them too. */
export function countsHeight(settings: HeightSettings): boolean {
  return Number.isFinite(settings.unitDistance) && settings.unitDistance > 0;
}

/** A difference in height of `gameUnits`, either way, in cells; 0 where the map counts none. */
export function riseInCells(gameUnits: number, settings: HeightSettings): number {
  if (!countsHeight(settings) || !Number.isFinite(gameUnits)) return 0;
  return lengthInCells(Math.abs(gameUnits), settings.unitDistance);
}

/**
 * `height` after `steps` steps up or down, as the map steps a reach (`steppedReach`: a cell's
 * distance, or the next range band): what the token menu's + and − do. Kept to thousandths, so
 * steps of 1.5 m never add up to 4.499999, and within `MAX_TOKEN_HEIGHT`.
 */
export function steppedHeight(height: number, steps: number, settings: Pick<MeasurementSettings, 'mode' | 'rangeBands' | 'unitDistance'>): number {
  const cells = steppedReach(height / settings.unitDistance, steps, settings);
  const next = Math.round(cells * settings.unitDistance * 1000) / 1000;
  return Math.max(-MAX_TOKEN_HEIGHT, Math.min(MAX_TOKEN_HEIGHT, next));
}

/** The field a token holds for `height`: none on the floor, so a token that lands is as it was before it rose. */
export function heightField(height: number): { elevation: number | undefined } {
  return { elevation: height === 0 ? undefined : height };
}

/** `gameUnits` as the map writes a distance: "30ft", "9 m", or the range band it reaches. */
function formatHeight(gameUnits: number, settings: MeasurementSettings): string {
  return formatDistance(Math.abs(gameUnits) / settings.unitDistance, settings);
}

/** A height as a menu writes it: "30ft", and "−10ft" below the floor. On the floor a map with range bands writes a dash: its nearest band is a distance, not none. */
export function signedHeight(gameUnits: number, settings: MeasurementSettings): string {
  if (gameUnits === 0 && settings.mode === 'abstract') return '–';
  return `${gameUnits < 0 ? '−' : ''}${formatHeight(gameUnits, settings)}`;
}

/**
 * What a token's chip says: "↑ 30ft" above the floor, "↓ 10ft" below it, "↑ Close" where the map
 * measures in range bands; nothing on the floor, and nothing where the map counts no heights.
 */
export function heightChipText(token: HasHeight, settings: MeasurementSettings): string {
  const height = tokenHeight(token);
  if (height === 0 || !countsHeight(settings)) return '';
  return `${height > 0 ? '↑' : '↓'} ${formatHeight(height, settings)}`;
}

/**
 * The height in game units of what stands at a world point: the token there, 0 on the floor. With
 * `seen`, of what a viewer sees standing there: the token on top of those `seen` says yes to, so a
 * token the players do not see adds nothing to a distance they read.
 */
export type HeightAt = (point: Point, seen?: (tokenId: string) => boolean) => number;

/**
 * How far apart in height a path's two ends are, in cells: each end is as high as the token it
 * lies on, and on the floor where it lies on none. The corners between them are not asked: the
 * difference is counted once over the whole path (`cellsByRule`).
 */
export function riseBetweenEnds(points: readonly Point[], heightAt: HeightAt, settings: HeightSettings): number {
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last || points.length < 2 || !countsHeight(settings)) return 0;
  return riseInCells(heightAt(last) - heightAt(first), settings);
}
