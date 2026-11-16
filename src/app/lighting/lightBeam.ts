import type { LightEmission } from '../types/lightingTypes';
import type { Point } from '../types/visionTypes';
import { coneAngle, visionCone, type VisionCone } from '../vision/visionCone';

/** The beam slider: from a narrow beam to all around, in degrees. */
export const BEAM_SLIDER = { min: 15, max: 360, step: 5 } as const;
/** Degrees a light turns by: on its slider, and when its handle is dragged (whole degrees with Alt). */
export const DIRECTION_STEP = 5;

/** A light on the map: a placed one with its own rotation, or a carried one with its token's. */
interface Shining {
  rotation?: number;
  emission: LightEmission;
  /** An area light glows from its whole area (`LightSource.area`). */
  area?: readonly Point[] | undefined;
}

/**
 * The cone a light shines in, or none when it shines all around. A source of magical darkness
 * never has one: it fills its radius; nor has an area light, which glows from its whole area.
 * `apex` is the radius lit all around at the light itself.
 */
export function beamOf(light: Shining, apex = 0): VisionCone | undefined {
  return light.emission.darkness || light.area ? undefined : visionCone(light.rotation, light.emission.angle, apex);
}

/** The emission shining `degrees` wide. A full turn stores no angle: the light shines all around. */
export function withBeam(emission: LightEmission, degrees: number): LightEmission {
  const angle = coneAngle(degrees);
  if (angle === coneAngle(emission.angle)) return emission;
  const { angle: _angle, ...rest } = emission;
  return angle === undefined ? rest : { ...rest, angle };
}

/** The rotation (degrees: 0 faces up, turning clockwise, as a token's) of a light at `origin` that faces `point`. */
export function directionTo(origin: Point, point: Point): number {
  return ((Math.atan2(point.y - origin.y, point.x - origin.x) * 180) / Math.PI + 450) % 360;
}

/** A dragged direction: in steps of five degrees, or whole degrees with `free` (Alt held), within one turn. */
export function snapDirection(degrees: number, free: boolean): number {
  const step = free ? 1 : DIRECTION_STEP;
  return (((Math.round(degrees / step) * step) % 360) + 360) % 360;
}
