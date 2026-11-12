/**
 * A token's height above the floor of its level (`BaseToken.elevation`, game units): a flier, or
 * below 0 a swimmer or a creature in a pit. It is counted where distances are measured: a map
 * that measures in range bands has no distance to count it in, so there it is neither shown,
 * offered nor counted.
 */

import { formatDistance, type MeasurementSettings } from '../grid/measurementFormat';
import type { Point } from '../types/visionTypes';
import { lengthInCells } from './measureGrid';

/** The farthest from the floor a token is put, in game units either way. */
export const MAX_TOKEN_HEIGHT = 100_000;

/** What a height is read from. */
export interface HasHeight {
  readonly elevation?: unknown;
}

/** What says how a map measures: whether in distances at all, and what one cell spans. */
export type HeightSettings = Pick<MeasurementSettings, 'mode' | 'unitDistance'>;

/** `token`'s height in game units: 0 on the floor, and for a value that is no height. */
export function tokenHeight(token: HasHeight | null | undefined): number {
  const height = token?.elevation;
  if (typeof height !== 'number' || !Number.isFinite(height)) return 0;
  return Math.max(-MAX_TOKEN_HEIGHT, Math.min(MAX_TOKEN_HEIGHT, height));
}

/** Whether the map counts heights: it measures distances, and a cell spans one. */
export function countsHeight(settings: HeightSettings): boolean {
  return settings.mode !== 'abstract' && Number.isFinite(settings.unitDistance) && settings.unitDistance > 0;
}

/** A difference in height of `gameUnits`, either way, in cells; 0 where the map counts none. */
export function riseInCells(gameUnits: number, settings: HeightSettings): number {
  if (!countsHeight(settings) || !Number.isFinite(gameUnits)) return 0;
  return lengthInCells(Math.abs(gameUnits), settings.unitDistance);
}

/**
 * `height` after `steps` steps of `step` game units, up or down: what the token menu's + and −
 * do. Kept to thousandths, so steps of 1.5 m never add up to 4.499999, and within `MAX_TOKEN_HEIGHT`.
 */
export function steppedHeight(height: number, steps: number, step: number): number {
  const next = Math.round((height + steps * step) * 1000) / 1000;
  return Math.max(-MAX_TOKEN_HEIGHT, Math.min(MAX_TOKEN_HEIGHT, next));
}

/** The field a token holds for `height`: none on the floor, so a token that lands is as it was before it rose. */
export function heightField(height: number): { elevation: number | undefined } {
  return { elevation: height === 0 ? undefined : height };
}

/** `gameUnits` as the map writes a distance: "30ft", "9 m". */
export function formatHeight(gameUnits: number, settings: MeasurementSettings): string {
  return formatDistance(Math.abs(gameUnits) / settings.unitDistance, settings);
}

/** A height as a menu writes it: "30ft", and "−10ft" below the floor. */
export function signedHeight(gameUnits: number, settings: MeasurementSettings): string {
  return `${gameUnits < 0 ? '−' : ''}${formatHeight(gameUnits, settings)}`;
}

/**
 * What a token's chip says: "↑ 30ft" above the floor, "↓ 10ft" below it; nothing on the floor, and
 * nothing where the map counts no heights.
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
