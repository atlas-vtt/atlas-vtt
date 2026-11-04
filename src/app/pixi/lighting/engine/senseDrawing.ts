import { perceivedLevel, showsMap } from '../../../gameSystems/senseRules';
import { NORMAL_SIGHT } from '../../../gameSystems/senses/generic';
import { brightThresholdOf, darkSightLookOf, darkSightTintOf } from '../../../lighting/sceneLightingOptions';
import { linearColor } from '../../../lighting/srgb';
import type { SceneLighting } from '../../../types/lightingTypes';
import type { SenseDefinition, SenseLook } from '../../../types/senseTypes';
import { ambientLevel } from '../../../vision/lightLevels';
import type { SeenSpot } from '../../../vision/perception';
import type { AmbientLight, Sight, SightRegion } from '../../../vision/sight';
import type { Polygon } from '../../../vision/visibility';
import type { PierceShape } from './DarknessMap';

/** What a sight mesh writes into the lighting layer: red, green, blue, alpha (see `compositeShader.ts`). */
export type SightChannels = readonly [number, number, number, number];

/**
 * How bright the map is drawn where a sense perceives it without light, as a share of its own
 * colours: `dim` is the grey of darkvision as it always was, `bright` close to daylight.
 */
export const DARK_SIGHT_LEVELS = { dim: 0.15, bright: 0.7 } as const;

/** A look without colour: the share of the map's colour it keeps, and its tint. */
const GREY_LOOKS: Record<Exclude<SenseLook, 'colour'>, { keep: number; tint: readonly [number, number, number] }> = {
  monochrome: { keep: 0.15, tint: [1, 1, 1] },
  'black-and-white': { keep: 0, tint: [1, 1, 1] },
  // Warm tones on a dark ground; brighter than grey at the same level, since red and orange weigh little.
  heat: { keep: 0, tint: [2.6, 0.8, 0.22] },
};

/** The scene draws every look without colour in the map's own colours (`darkSightLook: 'colour'`). */
const IN_COLOUR = { keep: 1, tint: [1, 1, 1] } as const;
/**
 * How colourful (largest less smallest sRGB channel, 0..1) a picked colour has to be to tint at
 * all, and from where it tints in full: a near grey or near black has no hue to speak of.
 */
const TINT_CHROMA = { none: 0.04, full: 0.16 } as const;

/**
 * The hue a picked tint gives the dark looks (`#rrggbb`), as a multiplier in linear light with
 * its strongest channel at 1, or null for no tint: no colour, or one without a hue (a grey, a
 * near black). The composite takes only the hue from it and keeps each pixel as bright as it
 * was (`tinted` in `compositeShader.ts`), so how dark or light the picked colour is says nothing.
 */
export function darkSightTint(color: string | null): readonly [number, number, number] | null {
  if (!color) return null;
  const srgb = [1, 3, 5].map((at) => Number.parseInt(color.slice(at, at + 2), 16) / 255);
  const chroma = Math.max(...srgb) - Math.min(...srgb);
  const strength = Math.min(1, Math.max(0, (chroma - TINT_CHROMA.none) / (TINT_CHROMA.full - TINT_CHROMA.none)));
  if (strength === 0) return null;
  const [r, g, b] = linearColor(color);
  const top = Math.max(r, g, b);
  const hue = (channel: number): number => 1 + (channel / top - 1) * strength;
  return [hue(r), hue(g), hue(b)];
}

function seesByLight(sense: SenseDefinition): boolean {
  return perceivedLevel(sense, 'bright') !== null || perceivedLevel(sense, 'dim') !== null;
}

/**
 * The channels the region of a sense is drawn into, or null when it draws nothing: a sense
 * that shows no map (`showsMap`: never one that walls do not stop), or one without an area.
 * - Red, seen by light: the token's sight, and a sense that needs no eyes. A sense of the eyes
 *   lies within the sight of its token, which is red already.
 * - Green or blue, perceived without light: green for a look without colour, blue in colour.
 * - Alpha: dim light is perceived as bright.
 */
export function sightChannels({ sense, polygon }: SightRegion): SightChannels | null {
  if (!showsMap(sense) || !polygon) return null;
  const inDarkness = perceivedLevel(sense, 'dark') !== null;
  const channels: SightChannels = [
    sense === NORMAL_SIGHT || (sense.worksWhileBlinded && seesByLight(sense)) ? 1 : 0,
    inDarkness && sense.look !== 'colour' ? 1 : 0,
    inDarkness && sense.look === 'colour' ? 1 : 0,
    sense.sees.dim === 'as-bright' ? 1 : 0,
  ];
  return channels.some((value) => value > 0) ? channels : null;
}

/** What the footprint of a token seen without the map around it is drawn into: seen by light, and in colour without. */
export const SPOT_CHANNELS: SightChannels = [1, 0, 1, 0];

/** How the composite draws what is perceived without light: one look without colour and one in colour per scene. */
export interface DarkLooks {
  /** Share of the map's colour the look without colour keeps. */
  greyKeep: number;
  /** Its tint, scaled by how bright it is drawn. */
  greyTint: readonly [number, number, number];
  /** How bright the look without colour is drawn: the level in `greyTint`. */
  greyLevel: number;
  /** How bright the look in colour is drawn. */
  colourLevel: number;
  /** The hue the scene tints the look without colour with (`darkSightTint`); null for none. */
  tint: readonly [number, number, number] | null;
}

function darkLevel(sense: SenseDefinition): number {
  return sense.sees.dark === 'as-bright' ? DARK_SIGHT_LEVELS.bright : DARK_SIGHT_LEVELS.dim;
}

/**
 * The dark looks of a scene, from the senses its vision tokens have. The green channel holds
 * one look for the whole scene: where senses with different looks without colour meet (a
 * collection that mixes monochrome and heat), the one drawn brighter wins, the first of equals.
 * Without such a sense it is the grey of darkvision, which draws nothing while green is empty.
 * The look in colour is as bright as its brightest sense; `spots` (tokens seen in their
 * footprint) are drawn bright.
 *
 * The scene may override the look without colour (`darkSightLook`: `grey` draws every such
 * sense, black and white and heat too, in the grey of darkvision, `colour` in the map's own
 * colours, each at the level the sense sees the dark at) and tint it (`darkSightTint`: the tint
 * gives the hue, the look keeps its brightness). Neither touches the senses that see in colour,
 * nor what any sense perceives.
 */
export function darkLooks(sight: Sight, spots = false, scene: Pick<SceneLighting, 'darkSightLook' | 'darkSightTint'> = {}): DarkLooks {
  let grey: SenseDefinition | null = null;
  let colourLevel: number = spots ? DARK_SIGHT_LEVELS.bright : DARK_SIGHT_LEVELS.dim;
  for (const region of sight.regions) {
    const channels = sightChannels(region);
    if (!channels) continue;
    if (channels[1] && (!grey || darkLevel(region.sense) > darkLevel(grey))) grey = region.sense;
    if (channels[2]) colourLevel = Math.max(colourLevel, darkLevel(region.sense));
  }
  const chosen = darkSightLookOf(scene);
  const own = GREY_LOOKS[grey && grey.look !== 'colour' ? grey.look : 'monochrome'];
  const look = chosen === 'colour' ? IN_COLOUR : chosen === 'grey' ? GREY_LOOKS.monochrome : own;
  const level = grey ? darkLevel(grey) : DARK_SIGHT_LEVELS.dim;
  return { greyKeep: look.keep, greyTint: [look.tint[0] * level, look.tint[1] * level, look.tint[2] * level], greyLevel: level, colourLevel, tint: darkSightTint(darkSightTintOf(scene)) };
}

/**
 * How much the ambient light is raised where dim light is perceived as bright: to the bright
 * threshold while the scene is dimly lit, not at all while it is dark or bright.
 */
export function ambientLift(scene: AmbientLight): number {
  return ambientLevel(scene) === 'dim' && scene.ambient > 0 ? brightThresholdOf(scene) / scene.ambient : 1;
}

/**
 * What is perceived inside magical darkness: the area of every sense that shows the map and
 * sees there, at the level it sees it (1 as bright light, 0.5 as dim), and the footprint of
 * every token shown where the map is not (a party token standing in the darkness).
 */
export function pierceShapes(sight: Sight, spots: readonly SeenSpot[] = []): PierceShape[] {
  const shapes: PierceShape[] = [];
  for (const region of sight.all ? [] : sight.regions) {
    const level = showsMap(region.sense) ? perceivedLevel(region.sense, 'magical-dark') : null;
    if (level && region.polygon) shapes.push({ origin: region.origin, polygon: region.polygon, level: level === 'bright' ? 1 : 0.5 });
  }
  for (const spot of spots) shapes.push({ origin: spot, polygon: spot.polygon, level: 1 });
  return shapes;
}

/**
 * What each token looks at the map through, once per polygon, as shapes the players see the veil
 * in, unless the token stands in a darkness itself (`SceneMaps`): 1 where a sense perceives the
 * dark, so the darkness swallows that sense's picture for this token, 0.5 where it has only eyes,
 * for which it swallows only light. What another token's sense shows is no reason for a veil here.
 */
export function sightFromOutside(sight: Sight): PierceShape[] {
  const shapes = new Map<Polygon, PierceShape>();
  for (const { origin, polygon, sense } of sight.all ? [] : sight.regions) {
    if (!polygon || !showsMap(sense)) continue;
    const outside = perceivedLevel(sense, 'dark') !== null ? 1 : 0.5;
    if (outside > (shapes.get(polygon)?.outside ?? 0)) shapes.set(polygon, { origin, polygon, level: 0, outside });
  }
  return [...shapes.values()];
}
