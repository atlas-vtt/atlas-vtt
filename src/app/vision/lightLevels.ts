import { brightThresholdOf, litThresholdOf } from '../lighting/sceneLightingOptions';
import type { LightLevel } from '../types/senseTypes';
import type { Point } from '../types/visionTypes';
import type { AmbientLight, LightReach } from './sight';
import { pointInPolygon } from './visibility';
import { areaDistance } from './areaReach';
import { inBox, reachBox } from './polygonBounds';
import { reflectedAt } from './reflectedLight';

/**
 * The light level the scene's ambient light alone gives every point: dark below the lit
 * threshold, bright from the bright threshold, dim between them (day is bright, dusk dim, night dark).
 */
export function ambientLevel(light: AmbientLight): LightLevel {
  if (light.ambient < litThresholdOf(light)) return 'dark';
  return light.ambient >= brightThresholdOf(light) ? 'bright' : 'dim';
}

/** The ambient light (0–1) at `point`: that of the topmost zone whose polygon contains it, else the scene's. */
export function ambientAt(point: Point, light: AmbientLight): number {
  const { zones } = light;
  if (zones) {
    for (let i = zones.length - 1; i >= 0; i--) {
      if (pointInPolygon(point, zones[i]!.polygon)) return zones[i]!.ambient;
    }
  }
  return light.ambient;
}

/** The light level the ambient light alone gives `point`, by the zone it lies in. */
function ambientLevelAt(point: Point, light: AmbientLight): LightLevel {
  return light.zones?.length ? ambientLevel({ ...light, ambient: ambientAt(point, light) }) : ambientLevel(light);
}

/**
 * The light level the lights that outrank `above` give `point`: bright within a bright radius,
 * dim within a dim one, where no wall is between; an area light counts both from the nearest
 * point of its area in clear view (`areaDistance`). Where a light's reflection reaches
 * (`reflectedAt`) it is dim. A darkness source is no light.
 */
function levelFromLights(point: Point, lights: readonly LightReach[], above = -Infinity): LightLevel {
  let level: LightLevel = 'dark';
  for (const light of lights) {
    if (light.darkness || (light.priority ?? 0) <= above || !inBox(point, reachBox(light))) continue;
    const direct = directLevel(point, light);
    if (direct === 'bright') return 'bright';
    if (direct === 'dim' || (level === 'dark' && light.reflection?.length && reflectedAt(point, light.reflection))) level = 'dim';
  }
  return level;
}

/**
 * A distance within this share of a radius lies on it. Snapped token centres are `offset + (n + ½) · size`,
 * and the difference of two misses a whole cell by a rounding error about half the time.
 */
const ON_RADIUS = 1e-6;

/** Whether `distance` reaches the radius `radius`, counting a rounding error short of it as on it. */
function reachesRadius(distance: number, radius: number): boolean {
  return distance >= radius * (1 - ON_RADIUS);
}

/**
 * The light level `light` gives `point` straight from itself, without its reflection. The dim
 * radius itself is dark: the picture has faded to nothing there (`lightFade`), and the polygon
 * would decide a point on it by which side it lies (a token one cell from a light of one cell).
 * An area light's own area is lit whatever its dim radius.
 */
function directLevel(point: Point, light: LightReach): LightLevel {
  const distance = light.parts ? areaDistance(point, light, light.dim) : Math.hypot(point.x - light.origin.x, point.y - light.origin.y);
  const beyond = distance > 0 ? reachesRadius(distance, light.dim) : distance > light.dim;
  if (beyond || (!light.parts && !pointInPolygon(point, light.polygon))) return 'dark';
  return distance <= light.bright ? 'bright' : 'dim';
}

/**
 * The priority of the strongest darkness source that covers `point`; none covers it at -Infinity.
 * Its radius itself is not covered, where its picture swallows nothing, as a light's dim radius is not lit.
 */
export function darknessAt(point: Point, lights: readonly LightReach[]): number {
  let priority = -Infinity;
  for (const light of lights) {
    if (!light.darkness || (light.priority ?? 0) <= priority) continue;
    if (!reachesRadius(Math.hypot(point.x - light.origin.x, point.y - light.origin.y), light.dim) && pointInPolygon(point, light.polygon)) priority = light.priority ?? 0;
  }
  return priority;
}

/**
 * How well `point` is lit, the brightest of the ambient light there (the scene's, or that of the
 * zone the point lies in) and every light that reaches it.
 * The one function sight rules read. Inside a darkness source (its dim radius, where no wall is
 * between) neither the ambient light nor a light counts, unless the light's priority is higher
 * than the darkness': such a light lights the point at its own level, and without one the
 * point is `magical-dark`.
 */
export function lightLevelAt(point: Point, ambient: AmbientLight, lights: readonly LightReach[]): LightLevel {
  const darkness = darknessAt(point, lights);
  if (darkness > -Infinity) {
    const outshining = levelFromLights(point, lights, darkness);
    return outshining === 'dark' ? 'magical-dark' : outshining;
  }
  const fromAmbient = ambientLevelAt(point, ambient);
  if (fromAmbient === 'bright') return 'bright';
  const fromLights = levelFromLights(point, lights);
  return fromLights === 'dark' ? fromAmbient : fromLights;
}
