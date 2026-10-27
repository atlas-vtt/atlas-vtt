import { BufferImageSource, Texture } from 'pixi.js';
import { afterEach, describe, expect, it } from 'vitest';
import { FADE_POWER, LIGHT_FADE_MIN } from '../../../../lighting/lightingConstants';
import { LIGHT_PRESETS, LIGHT_PRESET_IDS } from '../../../../lighting/lightPresets';

/** The presets that give light: a darkness has no falloff. */
const SHINING = LIGHT_PRESET_IDS.filter((id) => !LIGHT_PRESETS[id].emission.darkness);
import type { UnitScale } from '../../../../lighting/lightingUnits';
import { srgbToLinear } from '../../../../lighting/srgb';
import type { LightEmission } from '../../../../types/lightingTypes';
import { SEES_ALL, computeSight, type Sight } from '../../../../vision/sight';
import { engineLight } from '../../../../vision/lightSources';
import { LightingEngine } from '../LightingEngine';
import { createTestRenderer, renderThroughEngine } from './gpuTestUtils';
import { darkvision } from '../../../../vision/__tests__/senseSources';

const SIZE = 512;
const LUMA = [0.2126, 0.7152, 0.0722] as const;
/** The floor: mid grey (sRGB #808080) under no ambient light, so all it shows is the light. */
const FLOOR = 0x808080;
/** Floors from a dark dungeon map to white: the dim range must hold on all of them. */
const FLOORS = [0x404040, 0x595959, FLOOR, 0xffffff] as const;
/** 5 ft cells of 35 px: a lantern's 60 ft fit a 1024 px map with their fade. */
const SCALE: UnitScale = { unitDistance: 5, cellSize: 35 };
/** How far into its fade the eye still sees at least this share of what it saw where the fade began (`FADE_GLSL` gives 0.65 halfway; the knee and the tonemap take more: 32 to 62 % measured). */
const HALFWAY_SEEN = 0.3;
/** What the eye sees two pixels inside the dim radius, at most, of the fade's start: nearly black (up to 19 % measured, a torch on a white floor, whose start the tonemap compresses). */
const EDGE_SEEN = 0.2;

/**
 * What the players see of one light on an open floor, by distance from its flame: the displayed
 * luminance (the composite's sRGB pixel in linear light, Rec. 709 weights), after exposure and
 * tonemap, averaged over the four axis directions.
 */
interface Profile {
  bright: number;
  dim: number;
  /** Where the fade begins: the bright radius, or `LIGHT_FADE_MIN` of the dim radius before it. */
  from: number;
  /** World pixels between two samples. */
  step: number;
  at(distance: number): number;
  /** Chroma relative to luminance there, in linear light: how coloured the floor shows. */
  saturationAt(distance: number): number;
}

interface View {
  map?: number;
  sight?: Sight;
  floor?: number;
}

function hex(colour: number): string {
  return `#${colour.toString(16).padStart(6, '0')}`;
}

/** A map image of one colour, so the floor bounces as much light as it shows. */
function flatMap(colour: number): Texture {
  const pixels = new Uint8Array(4 * 4 * 4);
  for (let i = 0; i < pixels.length; i += 4) pixels.set([(colour >> 16) & 0xff, (colour >> 8) & 0xff, colour & 0xff, 255], i);
  return new Texture({ source: new BufferImageSource({ resource: pixels, width: 4, height: 4 }) });
}

function custom(bright: number, dim: number, intensity = 1): LightEmission {
  return { bright, dim, color: '#ffffff', intensity, animation: 'none' };
}

/** The lights the floor and intensity cases measure: a warm preset and a white light, which the tonemap darkens most. */
const KINDS: readonly (readonly [string, LightEmission])[] = [['torch', LIGHT_PRESETS.torch.emission], ['white light', custom(20, 40)]];

/** The level of the bright range: the displayed luminance halfway to the bright radius. */
function brightLevel(profile: Profile): number {
  return profile.at(profile.bright / 2);
}

/** What the eye sees at `d` as a share of what it sees where the fade begins: displayed luminance to the display's power. */
function seenShare(profile: Profile, d: number): number {
  return (profile.at(d) / profile.at(profile.from)) ** (1 / FADE_POWER);
}

/** The fade as the players see it: clearly lit halfway through, nearly black at the dim radius. */
function expectFade(profile: Profile, name: string): void {
  const halfway = seenShare(profile, (profile.from + profile.dim) / 2);
  const edge = seenShare(profile, profile.dim - 2);
  console.info(`${name}: seen halfway through the fade ${(halfway * 100).toFixed(1)}%, at the dim radius ${(edge * 100).toFixed(1)}%`);
  expect(halfway).toBeGreaterThan(HALFWAY_SEEN);
  expect(edge).toBeLessThan(EDGE_SEEN);
}

describe('light falloff as the players see it', () => {
  const cleanup: (() => void)[] = [];
  afterEach(() => {
    while (cleanup.length) cleanup.pop()!();
  });

  async function profileOf(emission: LightEmission, { map = 1024, sight = SEES_ALL, floor = FLOOR }: View = {}): Promise<Profile> {
    const renderer = await createTestRenderer(SIZE);
    cleanup.push(() => renderer.destroy());
    const engine = new LightingEngine(renderer);
    cleanup.push(() => engine.destroy());
    const albedo = flatMap(floor);
    cleanup.push(() => albedo.destroy(true));
    // Steady: the picture of the light's own settings, without a flicker sample.
    const light = { ...engineLight({ key: 'l', x: map / 2, y: map / 2, emission }, SCALE), animation: 'none' as const };
    engine.setEnabled(true);
    engine.setMode('player');
    engine.update({ bounds: { width: map, height: map }, albedo, walls: [], lights: [light], sight, sightRadius: 20, ambient: 0 });
    engine.flush();
    const pixel = renderThroughEngine(engine, renderer, { size: SIZE, scale: SIZE / map, x: 0, y: 0, tint: floor, map });
    const centre = SIZE / 2;
    const step = map / SIZE;
    /** Sample i lies i + ½ pixels along an axis and ½ pixel beside it; its colour is linear light. */
    const samples = Array.from({ length: centre }, (_, i) => {
      const around = [pixel(centre + i, centre), pixel(centre - 1 - i, centre), pixel(centre, centre + i), pixel(centre, centre - 1 - i)];
      return [0, 1, 2].map((channel) => around.reduce((sum, colour) => sum + srgbToLinear(colour[channel]! / 255), 0) / around.length);
    });
    const distanceOf = (i: number): number => step * Math.hypot(i + 0.5, 0.5);
    const colourAt = (distance: number): number[] => {
      const i = Math.min(samples.length - 2, Math.max(0, Math.floor(distance / step - 0.5)));
      const t = Math.min(1, Math.max(0, (distance - distanceOf(i)) / (distanceOf(i + 1) - distanceOf(i))));
      return samples[i]!.map((channel, c) => channel + (samples[i + 1]![c]! - channel) * t);
    };
    const at = (distance: number): number => colourAt(distance).reduce((sum, channel, c) => sum + channel * LUMA[c]!, 0);
    const saturationAt = (distance: number): number => {
      const colour = colourAt(distance);
      return (Math.max(...colour) - Math.min(...colour)) / at(distance);
    };
    return { bright: light.bright, dim: light.dim, from: Math.min(light.bright, light.dim * (1 - LIGHT_FADE_MIN)), step, at, saturationAt };
  }

  // Fabian, 2026-10-23: a light fades within its dim range into the dark, and never past it.
  it.each(SHINING)('fades a %s through its dim range: clearly lit halfway, nearly black at its dim radius', async (id) => {
    expectFade(await profileOf(LIGHT_PRESETS[id].emission), id);
  });

  it.each([
    ['all bright (bright = dim)', custom(30, 30), 1024],
    ['small (2 ft / 4 ft)', custom(2, 4), 1024],
    ['large (120 ft / 240 ft)', custom(120, 240), 4096],
    ['dim only (bright = 0)', custom(0, 40), 1024],
  ] as const)('fades a custom light through its dim range: %s', async (name, emission, map) => {
    expectFade(await profileOf(emission, { map }), name);
  });

  describe.each(FLOORS.map((floor) => [hex(floor), floor] as const))('on a %s floor', (name, floor) => {

    it.each(KINDS)(`fades a %s on ${name} through its dim range`, async (kind, emission) => {
      expectFade(await profileOf(emission, { floor }), `${kind} on ${name}`);
    });

    it.each(KINDS)(`shows a %s on ${name} brightest at the flame and its dim range clearly dimmer than its bright range`, async (_kind, emission) => {
      const profile = await profileOf(emission, { floor });
      const level = brightLevel(profile);
      expect(profile.at(profile.step)).toBeGreaterThan(level);
      expect(profile.at((profile.bright + profile.dim) / 2)).toBeLessThan(0.6 * level);
      expect(profile.at(profile.dim - 2)).toBeLessThan(0.5 * level);
    });
  });

  it.each(KINDS.flatMap(([kind, emission]) => [0.5, 0.25].map((intensity) => [kind, intensity, emission] as const)))(
    'fades a %s at intensity %s through its dim range',
    async (kind, intensity, emission) => {
      expectFade(await profileOf({ ...emission, intensity }), `${kind} at intensity ${intensity}`);
    },
  );

  it('keeps the colour of a light through its fade: no grey ring around it', async () => {
    const profile = await profileOf(LIGHT_PRESETS.torch.emission);
    const edge = profile.at(profile.from);
    const colour = profile.saturationAt(profile.from);
    let measured = 0;
    for (let d = profile.from; d < profile.dim; d += profile.step) {
      // Darker than this, 8-bit channels say little about colour.
      if (profile.at(d) < 0.15 * edge) continue;
      expect(profile.saturationAt(d)).toBeGreaterThan(0.85 * colour);
      measured++;
    }
    expect(measured).toBeGreaterThan(3);
  });

  it('shows nothing of the light past its dim radius', async () => {
    const profile = await profileOf(LIGHT_PRESETS.torch.emission);
    const level = brightLevel(profile);
    // Past the dim radius only bounced light is left: under a fiftieth of the bright level.
    for (const d of [profile.dim + 2, profile.dim + 20, profile.dim + 60]) expect(profile.at(d)).toBeLessThan(0.02 * level);
  });

  it('never shows the fade darker than the grey of darkvision there', async () => {
    // A token at the flame that sees 500 px, all of it with darkvision.
    const sight = computeSight([{ tokenId: 't', origin: { x: 512, y: 512 }, range: 500, senses: [darkvision(500)] }], []);
    const profile = await profileOf(LIGHT_PRESETS.torch.emission, { sight });
    const grey = profile.at(profile.dim + 10);
    expect(grey).toBeGreaterThan(0);
    for (let d = profile.from; d < profile.dim; d += profile.step) expect(profile.at(d)).toBeGreaterThan(0.9 * grey);
  });

  it.each(SHINING)('shows no ring around a %s: light only falls with distance, and nowhere steeply', async (id) => {
    const profile = await profileOf(LIGHT_PRESETS[id].emission);
    const level = brightLevel(profile);
    let steepest = 0;
    for (let d = profile.bright / 2; d < profile.dim + 20; d += profile.step) {
      const drop = profile.at(d) - profile.at(d + profile.step);
      // 8-bit channels and dither: a level may round up by one step.
      expect(drop).toBeGreaterThan(-0.01 * level);
      steepest = Math.max(steepest, drop / profile.step);
    }
    // The steepest fall, as a share of the bright level per hundredth of the dim radius: a hard edge
    // would drop the whole dim level, a third of the bright level, at once.
    const perHundredth = (steepest * profile.dim) / 100 / level;
    console.info(`${id}: steepest fall ${(perHundredth * 100).toFixed(1)}% of the bright level per 1% of the dim radius`);
    expect(perHundredth).toBeLessThan(0.12);
  });
});
