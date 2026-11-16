/**
 * Where the players see a roof: from above the walls, so walls do not hide it, by the ambient light
 * alone (a lamp beneath lights the floor, not the roof). A sense that shows the map sees a roof
 * within its reach and its cone, where it perceives in the ambient light there. Out of that, no roof
 * is drawn for them, and the floor beneath shows as their sight leaves it (or their memory of it).
 */

import { NORMAL_SIGHT } from '../gameSystems/senses/generic';
import { perceivedLevel, showsMap } from '../gameSystems/senseRules';
import type { TokenEntity } from '../types';
import type { LightLevel, SenseDefinition } from '../types/senseTypes';
import type { Point } from '../types/visionTypes';
import type { Sight } from './sight';
import { coneContains, visionCone, type VisionCone } from './visionCone';

/**
 * The senses that see roofs that count, the first so many: the picture reads them in a loop for
 * each pixel of a roof, and the rule reads the same list.
 */
export const MAX_ROOF_VIEWERS = 1024;

/** A sense that sees roofs: one that shows the map, with its reach and the cone its token looks in. */
export interface RoofViewer {
  origin: Point;
  radius: number;
  cone?: VisionCone | undefined;
  sense: SenseDefinition;
}

/** Who sees roofs: everyone wherever normal sight perceives (sight that is all), or these senses. */
export type RoofViewers = 'all' | readonly RoofViewer[];

/**
 * The senses of `sight` that see roofs, each with the cone of its token for a sense of the eyes
 * (a region's polygon was cut to it, which roofs do not read), the first `MAX_ROOF_VIEWERS`.
 * `tokens` holds every token whose regions `sight` has, on whichever level.
 */
export function roofViewers(sight: Sight, tokens: Readonly<Record<string, TokenEntity>>): RoofViewers {
  if (sight.all) return 'all';
  const viewers = sight.regions.flatMap((region) => {
    if (!showsMap(region.sense)) return [];
    const token = tokens[region.tokenId];
    const eyes = !region.sense.worksWhileBlinded;
    const cone = region.cone ?? (eyes && token?.vision ? visionCone(token.rotation, token.vision.angle, region.apex) : undefined);
    return [{ origin: region.origin, radius: region.radius, cone, sense: region.sense }];
  });
  return withoutCovered(viewers).slice(0, MAX_ROOF_VIEWERS);
}

const LEVELS: readonly LightLevel[] = ['dark', 'dim', 'bright'];

/**
 * `viewers` without those another sees all of: one that looks all around, perceives in every light
 * they do and whose disc holds theirs. Where the party sees all around, as far as the map goes, one
 * of them stands for all: the roof's picture reads the list for every pixel. The largest come first,
 * so most pixels find theirs early. Where a roof is seen does not change.
 */
function withoutCovered(viewers: RoofViewer[]): RoofViewer[] {
  const levels = (viewer: RoofViewer): boolean[] => LEVELS.map((level) => perceivedLevel(viewer.sense, level) !== null);
  const sorted = viewers.map((viewer) => ({ viewer, levels: levels(viewer) })).sort((a, b) => b.viewer.radius - a.viewer.radius);
  const kept: typeof sorted = [];
  for (const entry of sorted) {
    const { origin, radius } = entry.viewer;
    const covered = kept.some((other) => !other.viewer.cone && entry.levels.every((seen, i) => !seen || other.levels[i])
      && Math.hypot(origin.x - other.viewer.origin.x, origin.y - other.viewer.origin.y) + radius <= other.viewer.radius);
    if (!covered) kept.push(entry);
  }
  return kept.map(({ viewer }) => viewer);
}

/** Whether `viewer` reaches `point` from above: within its radius and its cone, whatever walls stand between. */
export function reachesFromAbove(viewer: RoofViewer, point: Point): boolean {
  const { origin, radius, cone } = viewer;
  if (Math.hypot(point.x - origin.x, point.y - origin.y) > radius) return false;
  return !cone || coneContains(cone, origin, point);
}

/**
 * Whether the players see a roof at `point`, where the ambient light alone is at `level`
 * (`ambientLevelOn`). Sight that is all (no vision token in the scene, or token vision off) sees
 * it wherever normal sight perceives in that light.
 */
export function roofSeenAt(point: Point, viewers: RoofViewers, level: LightLevel): boolean {
  if (viewers === 'all') return perceivedLevel(NORMAL_SIGHT, level) !== null;
  return viewers.some((viewer) => perceivedLevel(viewer.sense, level) !== null && reachesFromAbove(viewer, point));
}
