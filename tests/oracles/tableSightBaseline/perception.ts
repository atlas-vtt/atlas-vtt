// Frozen from 3c23746a6f54b67b442646ea8ff912c914c2447a src/app/vision/perception.ts. Only import paths are adapted.
import { perceivedLevel, showsMap } from '../../../src/app/gameSystems/senseRules';
import { movedWhileHeld } from '../../../src/app/lighting/sightOnDrop';
import type { HeldTokens } from '../../../src/app/types/viewUIState';
import { NORMAL_SIGHT } from '../../../src/app/gameSystems/senses/generic';
import type { TokenEntity } from '../../../src/app/types';
import type { ConditionDefinition, ConditionEffect } from '../../../src/app/types/collectionSettingsTypes';
import type { LightLevel } from '../../../src/app/types/senseTypes';
import type { Point } from '../../../src/app/types/visionTypes';
import type { WallSegment } from '../../../src/app/types/wallTypes';
import { computeTokenPixelSize } from '../../../src/app/pixi/token-renderer/tokenSizing';
import { lightLevelAt } from '../../../src/app/vision/lightLevels';
import type { AmbientLight, LightReach, Sight, SightRegion } from './sight';
import { tokenEffects } from '../../../src/app/vision/sightRules';
import { computeVisibility, pointInPolygon, type Polygon } from '../../../src/app/vision/visibility';
import { coneContains } from '../../../src/app/vision/visionCone';

/**
 * How the vision tokens perceive something: `seen` by a precise sense, `sensed` only by
 * imprecise ones (its place is known, it is not seen), or not at all.
 */
export type Perception = 'seen' | 'sensed' | 'unseen';

/** What the conditions of a token do to how it is perceived. */
export interface PerceivedTarget {
  /** Only senses that see invisible things perceive it. */
  invisible?: boolean;
  /** Senses that ignore what is in the air do not perceive it. */
  airborne?: boolean;
  /** No sense perceives it. */
  undetected?: boolean;
}

/** The target a token with these condition effects is. */
export function targetOf(effects: ReadonlySet<ConditionEffect>): PerceivedTarget {
  return { invisible: effects.has('invisible'), airborne: effects.has('airborne'), undetected: effects.has('undetected') };
}

/** A point this much farther than a region's radius is still looked up in its polygon: the sweep's own rounding. */
const RADIUS_SLACK = 1e-6;

/**
 * Whether `point` lies where the region's sense reaches. A polygon never reaches beyond its
 * radius, so the distance rules most points out before the polygon is looked at.
 */
export function regionContains(region: SightRegion, point: Point): boolean {
  return withinRadius(region, point) && withinArea(region, point);
}

function withinRadius(region: SightRegion, point: Point): boolean {
  return Math.hypot(point.x - region.origin.x, point.y - region.origin.y) <= region.radius + (region.polygon ? RADIUS_SLACK : 0);
}

/** For a point within the region's radius: whether walls and the cone leave it in reach. */
function withinArea(region: SightRegion, point: Point): boolean {
  if (region.polygon) return pointInPolygon(point, region.polygon);
  return !region.cone || coneContains(region.cone, region.origin, point);
}

/** The light at a point, or how to find it: finding it costs a look at every light, so it waits until a sense reaches as far as the point. */
type LevelAt = LightLevel | (() => LightLevel);

/** Whether some sense of a vision token reaches `point`, whatever the light there. */
export function withinReach(point: Point, sight: Sight): boolean {
  return sight.all || sight.regions.some((region) => regionContains(region, point));
}

/**
 * The region through which something at `point` is perceived best, where the light is at
 * `level`: each region asks its sense whether it perceives at that level, and the target's
 * conditions rule senses out. A precise sense comes before an imprecise one; null when no
 * region perceives it (also without vision tokens, when there are no regions). The cheap
 * questions come first: the distance, then the light, and the polygon only for a sense that
 * perceives in that light.
 */
export function perceivingRegion(point: Point, sight: Sight, level: LevelAt, target: PerceivedTarget = {}): SightRegion | null {
  if (target.undetected) return null;
  let found: LightLevel | undefined;
  let sensing: SightRegion | null = null;
  for (const region of sight.regions) {
    const { sense } = region;
    if (target.invisible && !region.seesInvisible) continue;
    if (target.airborne && sense.ignores === 'airborne') continue;
    if (!withinRadius(region, point)) continue;
    found ??= typeof level === 'function' ? level() : level;
    if (perceivedLevel(sense, found) === null || !withinArea(region, point)) continue;
    if (sense.precise) return region;
    sensing ??= region;
  }
  return sensing;
}

/**
 * How `sight` perceives something at `point`, where the light is at `level` (`perceivingRegion`).
 * Without vision tokens, or with the scene's token vision off (`sight.all`), whatever is lit is
 * seen, wherever it is and whatever its conditions: invisible and undetected act only while
 * sight is the tokens'.
 */
export function perceive(point: Point, sight: Sight, level: LevelAt, target: PerceivedTarget = {}): Perception {
  if (sight.all) return perceivedLevel(NORMAL_SIGHT, typeof level === 'function' ? level() : level) !== null ? 'seen' : 'unseen';
  const region = perceivingRegion(point, sight, level, target);
  if (!region) return 'unseen';
  return region.sense.precise ? 'seen' : 'sensed';
}

/** What perception reads besides sight and light. */
export interface PerceptionOptions {
  /** The conditions of the map's collection, for those that change sight; none reads no condition. */
  conditions?: readonly ConditionDefinition[];
  /** The tokens the pointer holds while sight waits for the drop, with the places they were taken from. */
  held?: HeldTokens;
}

/** The footprint of a token that is shown where the map around it is not, in world pixels. */
export interface SeenSpot {
  x: number;
  y: number;
  radius: number;
  /**
   * What is shown: the footprint as far as it is in a clear line from the token's centre. Walls
   * cut it like any sight, so a token that stands at a wall shows nothing of the other side.
   */
  polygon: Polygon;
}

/**
 * The tokens the players see where no sense shows them the map, so that the picture is dark
 * there: each is shown within its own footprint.
 * - A token with vision: the players always see their party, also one standing in darkness or
 *   blinded. One the pointer has moved beyond the sight that stayed behind is not shown until
 *   the drop (`held`, as in `tokenPerception`).
 * - A token a precise sense that shows no map sees (echolocation).
 *
 * Never a hidden token. `tokens` is the record their places are read from, `walls` the sealed
 * walls sight is worked out with: every footprint ends at them.
 */
export function seenSpots(
  sight: Sight,
  ambient: AmbientLight,
  lights: readonly LightReach[],
  tokens: Record<string, TokenEntity>,
  cellSize: number,
  walls: readonly WallSegment[],
  { conditions = [], held = {} }: PerceptionOptions = {},
): SeenSpot[] {
  if (sight.all) return [];
  const withMap: Sight = { all: false, regions: sight.regions.filter(({ sense }) => showsMap(sense)) };
  const seesCreatures = sight.regions.some(({ sense }) => sense.precise && !showsMap(sense));
  const spots: SeenSpot[] = [];
  for (const token of Object.values(tokens)) {
    const party = !!token.vision?.enabled;
    if (token.isHidden || (!party && !seesCreatures)) continue;
    const at = { x: token.x, y: token.y };
    const level = lightLevelAt(at, ambient, lights);
    if (party) {
      if (movedWhileHeld(token, held) && !withinReach(at, sight)) continue;
      if (perceive(at, withMap, level) === 'seen') continue;
    } else {
      const target = targetOf(tokenEffects(token, conditions));
      if (perceive(at, sight, level, target) !== 'seen' || perceive(at, withMap, level, target) === 'seen') continue;
    }
    const radius = computeTokenPixelSize(cellSize, token.size || 1) / 2;
    spots.push({ ...at, radius, polygon: computeVisibility(at, radius, walls, undefined, 'sight') });
  }
  return spots;
}
