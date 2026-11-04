import { isRecord } from '../utils/guards';
import { FLICKER_INTERVAL_MS, MAX_TEXELS, TILE_RAYS } from './lightingConstants';
import { LIGHTING_QUALITY, LIGHTING_QUALITY_LEVELS, isLightingQualityLevel, type LightingQuality, type LightingQualityLevel } from './lightingQuality';

/** The lighting picture: traced on the graphics device, or the rules' polygons filled. */
export type PictureChoice = 'traced' | 'polygons';
/** The world textures' texel cap on large maps (`LightingQuality.maxTexels`). */
export type DetailChoice = 'fine' | 'medium' | 'coarse';
/** On which maps light bounces (`bounceMaxSide`). */
export type BounceChoice = 'all' | 'smaller' | 'off';
/** How often flickering flames are redrawn (`flickerMs`). */
export type FlamesChoice = 'lively' | 'calm';
/** Rays across a flame for soft shadow edges (`tileRays`). */
export type ShadowsChoice = 'fine' | 'medium' | 'coarse';
/** Frames a second moving liquids are shown at (`liquidFps`). */
export type LiquidsChoice = 30 | 15 | 10;
/** Whether the lit map is drawn at the screen's own pixels or at one device pixel per CSS pixel (`compositePixelRatio`). */
export type LitMapChoice = 'sharp' | 'standard';

/** Every choice the Graphics page offers; a preset is one row of them. */
export interface GraphicsKnobs {
  readonly picture: PictureChoice;
  readonly detail: DetailChoice;
  readonly bounce: BounceChoice;
  readonly flames: FlamesChoice;
  readonly shadows: ShadowsChoice;
  readonly liquids: LiquidsChoice;
  readonly litMap: LitMapChoice;
}

export type GraphicsKnob = keyof GraphicsKnobs;

/** The three presets: what `LIGHTING_QUALITY` holds, as knobs (`graphicsSettings.test.ts` holds them equal). */
export const GRAPHICS_PRESETS: Record<LightingQualityLevel, GraphicsKnobs> = {
  high: { picture: 'traced', detail: 'fine', bounce: 'all', flames: 'lively', shadows: 'fine', liquids: 30, litMap: 'sharp' },
  balanced: { picture: 'traced', detail: 'medium', bounce: 'smaller', flames: 'calm', shadows: 'medium', liquids: 15, litMap: 'standard' },
  saver: { picture: 'polygons', detail: 'coarse', bounce: 'off', flames: 'calm', shadows: 'coarse', liquids: 10, litMap: 'standard' },
};

/** The values a knob may take, from the cheapest to the finest, as a game's options list them. */
const CHOICES: { readonly [K in GraphicsKnob]: readonly GraphicsKnobs[K][] } = {
  picture: ['polygons', 'traced'],
  detail: ['coarse', 'medium', 'fine'],
  bounce: ['off', 'smaller', 'all'],
  flames: ['calm', 'lively'],
  shadows: ['coarse', 'medium', 'fine'],
  liquids: [10, 15, 30],
  litMap: ['standard', 'sharp'],
};

export const GRAPHICS_KNOBS = Object.keys(CHOICES) as readonly GraphicsKnob[];

/** The values a knob may take, from the cheapest to the finest. */
export function choicesOf<K extends GraphicsKnob>(knob: K): readonly GraphicsKnobs[K][] {
  return CHOICES[knob];
}

const TEXELS: Record<DetailChoice, number> = { fine: MAX_TEXELS, medium: 2048, coarse: 1024 };
const BOUNCE_SIDE: Record<BounceChoice, number> = { all: Infinity, smaller: 6144, off: 0 };
const FLICKER: Record<FlamesChoice, number> = { lively: FLICKER_INTERVAL_MS, calm: 66 };
const RAYS: Record<ShadowsChoice, number> = { fine: TILE_RAYS, medium: 16, coarse: 8 };

/** The knobs that only the traced picture reads: the polygon picture has no bounce, flicker or traced shadows. */
export const TRACED_KNOBS: readonly GraphicsKnob[] = ['bounce', 'flames', 'shadows'];

/** The qualities of mixes of knobs made so far, by their knobs: the same knobs give the same object, as a preset gives `LIGHTING_QUALITY`'s. */
const MIXES = new Map<string, LightingQuality>();

/**
 * The lighting quality `knobs` describe, in the shape the engine, the liquids and the composite
 * read: a preset's own object (`LIGHTING_QUALITY`), else one object per mix for as long as Atlas
 * runs, so whoever compares qualities by identity sees a change only when the knobs changed.
 */
export function qualityOf(knobs: GraphicsKnobs): LightingQuality {
  const preset = presetOf(knobs);
  if (preset !== null) return LIGHTING_QUALITY[preset];
  const key = GRAPHICS_KNOBS.map((knob) => String(knobs[knob])).join('|');
  let quality = MIXES.get(key);
  if (!quality) {
    const screen = knobs.litMap === 'standard' ? { compositePixelRatio: 1 } : {};
    quality = knobs.picture === 'polygons'
      ? { picture: 'polygons', maxTexels: TEXELS[knobs.detail], liquidFps: knobs.liquids, ...screen }
      : { maxTexels: TEXELS[knobs.detail], bounceMaxSide: BOUNCE_SIDE[knobs.bounce], flickerMs: FLICKER[knobs.flames], tileRays: RAYS[knobs.shadows], liquidFps: knobs.liquids, ...screen };
    MIXES.set(key, quality);
  }
  return quality;
}

/** The preset `knobs` are, or null where they are a mix of their own. */
export function presetOf(knobs: GraphicsKnobs): LightingQualityLevel | null {
  return LIGHTING_QUALITY_LEVELS.find((level) => GRAPHICS_KNOBS.every((knob) => GRAPHICS_PRESETS[level][knob] === knobs[knob])) ?? null;
}

/** What this device chose: a preset, and the knobs set away from it. */
export interface GraphicsChoice {
  readonly preset: LightingQualityLevel;
  readonly overrides: Partial<GraphicsKnobs>;
}

/** The knobs of a choice: its preset's, each override in its place. */
export function knobsOf(choice: GraphicsChoice): GraphicsKnobs {
  return { ...GRAPHICS_PRESETS[choice.preset], ...choice.overrides };
}

/** `overrides` over `base` with one knob set: an override where it differs from the base, none where it is the base's again. */
export function overrideKnob<K extends GraphicsKnob>(base: GraphicsKnobs, overrides: Partial<GraphicsKnobs>, knob: K, value: GraphicsKnobs[K]): Partial<GraphicsKnobs> {
  const { [knob]: _dropped, ...rest } = overrides;
  return base[knob] === value ? rest : { ...rest, [knob]: value };
}

/** `choice` with one knob set: an override where it differs from the preset, none where it is the preset's again. */
export function withKnob<K extends GraphicsKnob>(choice: GraphicsChoice, knob: K, value: GraphicsKnobs[K]): GraphicsChoice {
  return { preset: choice.preset, overrides: overrideKnob(GRAPHICS_PRESETS[choice.preset], choice.overrides, knob, value) };
}

function isChoiceOf<K extends GraphicsKnob>(knob: K, value: unknown): value is GraphicsKnobs[K] {
  return (CHOICES[knob] as readonly unknown[]).includes(value);
}

/** Stored overrides read back: each knob's value where it is a choice of that knob, nothing of anything else. */
export function parseGraphicsOverrides(value: unknown): Partial<GraphicsKnobs> {
  const overrides: Partial<GraphicsKnobs> = {};
  if (!isRecord(value)) return overrides;
  for (const knob of GRAPHICS_KNOBS) {
    const stored = value[knob];
    if (stored !== undefined && isChoiceOf(knob, stored)) Object.assign(overrides, { [knob]: stored });
  }
  return overrides;
}

/** A stored choice read back, or null for anything that is not one; an override that is no choice of its knob is dropped. */
export function parseGraphicsChoice(value: unknown): GraphicsChoice | null {
  if (!isRecord(value) || !isLightingQualityLevel(value.preset)) return null;
  return { preset: value.preset, overrides: parseGraphicsOverrides(value.overrides) };
}
