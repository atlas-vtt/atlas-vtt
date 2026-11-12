/**
 * The light a kept area gives (`KeptMeasure.light`), as the lighting reads it: where it shines from
 * and how is the area's shape. A circle and an aura shine from their centre, a cone as a beam from
 * its apex, a square and a line from their whole area; a darkness fills a circle and is nothing on
 * any other shape, since a darkness has a radius and no outline. Also what an area starts with when
 * it is given light or an effect. Pure; `activeLights` puts these among the scene's lights.
 */

import { readArea } from '../lighting/lightArea';
import { directionTo, withBeam } from '../lighting/lightBeam';
import { readEmission } from '../lighting/lightingObjects';
import { maxLightRange } from '../lighting/lightRanges';
import { worldToGameUnits, type UnitScale } from '../lighting/lightingUnits';
import type { LightEmission } from '../types/lightingTypes';
import type { Point } from '../types/visionTypes';
import { auraCells, type AuraToken } from './auraArea';
import { isAura } from './keptMeasures';
import { MEASURE_EFFECT_STARTS, type MeasureEffect } from './measureEffects';
import { shapedArea } from './measureGeometry';
import type { KeptMeasure, MeasureChanges, MeasureInput, MeasureToolOptions, Measurement } from './measureTypes';
import { spaceRadius } from './tokenDistance';

/** A kept area's light among the scene's lights (an `ActiveLight`). */
export interface MeasureLight {
  /** `measure:<id>`, stable while the measurement exists. */
  key: string;
  x: number;
  y: number;
  emission: LightEmission;
  /** Where a cone's beam faces, degrees as a placed light's. */
  rotation?: number;
  /** The outline a square or a line glows from; `x`, `y` are its middle. */
  area?: readonly Point[];
}

/** What of a map places the lights of its kept areas. */
export interface MeasureLightSetting {
  readonly scale: UnitScale;
  /** The full opening of a cone, degrees: a cone's light shines as wide. */
  readonly coneAngle: number;
}

/** The kept areas of a level with what places their lights. */
export interface KeptLights extends MeasureLightSetting {
  readonly measures: readonly KeptMeasure[];
}

/** What a light was worked out from, and the light: asked again with the same, it is the same light. */
interface Known {
  readonly shape: KeptMeasure['shape'];
  readonly points: readonly Point[];
  readonly width: number | undefined;
  readonly color: string | undefined;
  readonly follows: string | undefined;
  readonly aura: number | undefined;
  readonly coneAngle: number;
  readonly cellSize: number;
  readonly unitDistance: number;
  /** Where an aura's token stood, and how large it was. */
  readonly at: AuraToken | null;
  readonly light: MeasureLight | null;
}

/**
 * By the emission a measurement holds, which stays the same object while its light is not edited:
 * a measurement that changes in something else (who sees it, its look) keeps its light as it was.
 * Then by the measurement's id, since nothing keeps two measurements from holding one emission.
 */
const known = new WeakMap<LightEmission, Map<string, Known>>();

const lengthOf = ([from, to]: readonly Point[]): number => (from && to ? Math.hypot(to.x - from.x, to.y - from.y) : 0);
const tenths = (value: number): number => Math.round(value * 10) / 10;

/** Whether an area of `shape` can be a magical darkness: only what has a radius. */
export function canBeDarkness(shape: Measurement['shape']): boolean {
  return shape === 'circle';
}

/** The emission in the area's colour, where the area names one: an area has one colour, and its light shares it. */
function coloured(emission: LightEmission, color: string | undefined): LightEmission {
  return color === undefined || color === emission.color ? emission : { ...emission, color };
}

/** A darkness as wide as its circle is now (`radius`, world pixels), whatever it was made with. */
function darkness(emission: LightEmission, radius: number, scale: UnitScale): LightEmission {
  const dim = worldToGameUnits(radius, scale);
  return emission.dim === dim && emission.bright === 0 ? emission : { ...emission, bright: 0, dim };
}

function lightOf(measure: KeptMeasure, emission: LightEmission, token: AuraToken | null, { scale, coneAngle }: MeasureLightSetting): MeasureLight | null {
  const [origin, end] = measure.points;
  if (measure.shape === 'ruler' || !origin || !end) return null;
  if (emission.darkness && !canBeDarkness(measure.shape)) return null;
  const key = `measure:${measure.id}`;
  const shining = coloured(emission, measure.color);
  if (measure.shape === 'circle') {
    const aura = isAura(measure);
    // An aura shines from its token, and no token on the map is no light.
    if (aura && !token) return null;
    const at = aura && token ? token : origin;
    const radius = aura && token ? spaceRadius(token, { size: scale.cellSize }) + auraCells(measure.aura, scale.unitDistance) * scale.cellSize : lengthOf(measure.points);
    return { key, x: at.x, y: at.y, emission: emission.darkness ? darkness(shining, radius, scale) : shining };
  }
  if (measure.shape === 'cone') return { key, x: origin.x, y: origin.y, emission: withBeam(shining, coneAngle), rotation: directionTo(origin, end) };
  // A cone's rules shape neither a square nor a line.
  const shaped = shapedArea(measure, { coneAngle, coneEnd: 'round', lineWidth: scale.cellSize });
  const area = shaped && readArea([...(shaped.rings[0] ?? [])]);
  if (!shaped || !area) return null;
  const { minX, minY, maxX, maxY } = shaped.bounds;
  return { key, x: (minX + maxX) / 2, y: (minY + maxY) / 2, emission: shining, area };
}

/**
 * The lights the kept areas of a level give, hidden ones too: the GM hid the mark, not the fire.
 * `tokens` are the tokens as light reads them, so an aura's light stands where its token's own
 * light would. An area whose light, shape and colour did not change answers with the same light,
 * an aura's while its token stands where it stood.
 */
export function measureLights(kept: KeptLights, tokens: Readonly<Record<string, AuraToken>>): MeasureLight[] {
  const { scale, coneAngle } = kept;
  const lights: MeasureLight[] = [];
  for (const measure of kept.measures) {
    const emission = readEmission(measure.light);
    if (!emission) continue;
    const token = (isAura(measure) && tokens[measure.follows]) || null;
    const last = known.get(emission)?.get(measure.id);
    const same = last && last.shape === measure.shape && last.points === measure.points && last.width === measure.width && last.color === measure.color
      && last.follows === measure.follows && last.aura === measure.aura && last.coneAngle === coneAngle && last.cellSize === scale.cellSize && last.unitDistance === scale.unitDistance
      && (last.at === token || (!!last.at && !!token && last.at.x === token.x && last.at.y === token.y && last.at.size === token.size));
    const light = same ? last.light : lightOf(measure, emission, token, kept);
    if (!same) {
      const { shape, points, width, color, follows, aura } = measure;
      const byId = known.get(emission) ?? new Map<string, Known>();
      known.set(emission, byId);
      byId.set(measure.id, { shape, points, width, color, follows, aura, coneAngle, cellSize: scale.cellSize, unitDistance: scale.unitDistance, at: token && { x: token.x, y: token.y, size: token.size }, light });
    }
    if (light) lights.push(light);
  }
  return lights;
}

/** Whether two lists of lights light alike: the same lights at the same places. */
export function sameMeasureLights(a: readonly MeasureLight[], b: readonly MeasureLight[]): boolean {
  return a.length === b.length && a.every((light, index) => {
    const other = b[index]!;
    return light === other || (light.key === other.key && light.x === other.x && light.y === other.y && light.emission === other.emission && light.rotation === other.rotation && light.area === other.area);
  });
}

/** What of an area its starting light is sized by. */
type LitArea = Pick<Measurement, 'shape' | 'points' | 'width'>;

/**
 * The two ranges an area's light starts with, game units. A circle and a cone are bright to their
 * edge and dim as far again. A square and a line glow from their whole area, so theirs count from
 * the outline: dim as far past it as the area is thick from its middle, a cell at least, and
 * bright half as far.
 */
function startingRanges({ shape, points, width }: LitArea, scale: UnitScale): Pick<LightEmission, 'bright' | 'dim'> {
  const most = maxLightRange(scale);
  const units = (world: number): number => Math.min(most, tenths(worldToGameUnits(world, scale)));
  const length = lengthOf(points);
  if (shape === 'circle' || shape === 'cone') return { bright: units(length), dim: units(2 * length) };
  const across = shape === 'line' ? Math.min(width ?? scale.cellSize, length) : length;
  const dim = Math.max(scale.cellSize, across / 2);
  return { bright: units(dim / 2), dim: units(dim) };
}

/**
 * The light an area takes when it is given one: sized by the area (`startingRanges`), in `color`
 * ('#rrggbb', the colour the area is drawn in), flickering with Fire and Lightning and steady
 * otherwise. A circle with Shadow takes a magical darkness instead.
 */
export function startingLight(area: LitArea, effect: MeasureEffect | null | undefined, scale: UnitScale, color: string): LightEmission {
  const ranges = startingRanges(area, scale);
  const start = effect ? MEASURE_EFFECT_STARTS[effect] : null;
  if (start?.darkness && canBeDarkness(area.shape)) return { bright: 0, dim: ranges.bright, color, intensity: 1, animation: 'none', darkness: true };
  return { ...ranges, color, intensity: 1, animation: start?.light === 'flicker' ? 'torch' : 'none' };
}

/** What of a scene an area's starting light goes by. */
export interface LookSetting {
  readonly scale: UnitScale;
  /** The scene is lit: on an unlit one no area is given a light. */
  readonly lit: boolean;
  /** '#rrggbb': what an area without a colour of its own is drawn in. */
  readonly accent: string;
}

/** Whether an area of `shape` starts with light when it is given `effect`: Fire, Lightning, Radiance, and Shadow where it can be a darkness. */
function startsLit(effect: MeasureEffect, shape: Measurement['shape']): boolean {
  const start = MEASURE_EFFECT_STARTS[effect];
  return start.light !== null || (start.darkness && canBeDarkness(shape));
}

/**
 * What an area kept with the measure tool takes from the tool's look besides its colour: the
 * effect chosen there and, on a lit scene, the light that effect starts with. A ruler takes none.
 */
export function toolLook(area: LitArea, tool: Pick<MeasureToolOptions, 'color' | 'effect'>, { scale, lit, accent }: LookSetting): Pick<MeasureInput, 'effect' | 'light'> {
  const { effect } = tool;
  if (!effect || area.shape === 'ruler') return {};
  return { effect, ...(lit && startsLit(effect, area.shape) && { light: startingLight(area, effect, scale, tool.color ?? accent) }) };
}

/**
 * The colour an area has once it is given `effect`: the effect's usual one, unless the area
 * already has a look whose colour was changed, which then stays. Null is the theme's accent.
 */
export function colourWithEffect(color: string | null | undefined, before: MeasureEffect | null | undefined, effect: MeasureEffect): string | null {
  return !before || color === MEASURE_EFFECT_STARTS[before].color ? MEASURE_EFFECT_STARTS[effect].color : color ?? null;
}

/**
 * What choosing `effect` changes on a kept area, in one write: its look, its colour
 * (`colourWithEffect`) and, on a lit scene (`lit`), its light as the effect starts with: on for
 * Fire, Lightning and Radiance, a darkness for Shadow on a circle, off for the others. Choosing
 * none takes the look away and leaves colour and light.
 */
export function effectChoice(measure: KeptMeasure, effect: MeasureEffect | null, { scale, lit, accent }: LookSetting): MeasureChanges {
  if (effect === null) return { effect: undefined };
  const color = colourWithEffect(measure.color, measure.effect, effect);
  return {
    effect,
    color: color ?? undefined,
    ...(lit && { light: startsLit(effect, measure.shape) ? startingLight(measure, effect, scale, color ?? accent) : undefined }),
  };
}
