import { describe, expect, it } from 'vitest';
import { BUILT_IN_SENSES, GENERIC_SENSES, NORMAL_SIGHT } from '../../src/app/gameSystems/senses';
import type { MeasurementSettings } from '../../src/app/grid/measurementFormat';
import { LIGHT_PRESETS } from '../../src/app/lighting/lightPresets';
import { SceneModelBuilder, SceneSpots } from '../../src/app/vision/sceneModel';
import type { ViewAtlasState } from '../../src/app/storeFactory';
import type { TokenEntity } from '../../src/app/types';
import type { LightEmission, LightSource } from '../../src/app/types/lightingTypes';
import type { TokenSense } from '../../src/app/types/senseTypes';
import { lightLevelAt } from '../../src/app/vision/lightLevels';
import type { SightRules } from '../../src/app/vision/sightRules';

const BOUNDS = { width: 2000, height: 1200 };
const measurement = (): MeasurementSettings => ({ mode: 'grid', unitType: 'feet', unitDistance: 5, diagonalRule: 'chebyshev', rangeBands: [] }) as unknown as MeasurementSettings;
type SceneState = Parameters<SceneModelBuilder['update']>[0];
const torch = LIGHT_PRESETS.torch.emission;
/** A Darkness of 15 ft: 210 px on the 70 px grid. */
const darkness: LightEmission = { bright: 0, dim: 15, color: '#000000', intensity: 1, animation: 'none', darkness: true };
const RULES: SightRules = { definitions: [...GENERIC_SENSES, ...BUILT_IN_SENSES['builtin:dnd5e']!, ...BUILT_IN_SENSES['builtin:pathfinder2e']!], conditions: [] };
const light = (id: string, x: number, emission: LightEmission): LightSource => ({ id, kind: 'light', x, y: 600, emission });
const token = (id: string, x: number, senses?: TokenSense[]): TokenEntity => ({ id, kind: 'token', imagePath: `${id}.png`, x, y: 600, vision: { enabled: true, ...(senses && { senses }) } });

function state(lights: Record<string, LightSource>, tokens: Record<string, TokenEntity> = {}, ambient = 0): SceneState {
  return { objects: { walls: {}, lights, tokens } as ViewAtlasState['objects'], lighting: { enabled: true, ambient }, grid: null, heldTokens: {} };
}

const build = (scene: SceneState): ReturnType<SceneModelBuilder['update']>['model'] => new SceneModelBuilder().update(scene, BOUNDS, measurement, () => RULES).model;

describe('a light inside magical darkness', () => {
  const DARK = light('dark', 500, darkness);

  it('gives no light at all, inside the darkness or beyond it, in the picture and the rule alike', () => {
    // A torch 70 px from the source: its 40 ft would reach 350 px past the darkness' edge.
    const model = build(state({ dark: DARK, torch: light('torch', 570, torch) }));
    expect(model.lights.map((engine) => engine.key)).toEqual(['light:dark']);
    expect(model.reaches).toHaveLength(1);
    expect(model.reaches[0]).toMatchObject({ darkness: true });
    expect(lightLevelAt({ x: 800, y: 600 }, { ambient: 0 }, model.reaches)).toBe('dark');
  });

  it('shines as ever when it outshines the darkness, and when it stands outside it', () => {
    const outshining = build(state({ dark: DARK, sun: light('sun', 570, { ...torch, priority: 1 }) }));
    expect(outshining.lights.map((engine) => engine.key)).toEqual(['light:dark', 'light:sun']);
    expect(lightLevelAt({ x: 800, y: 600 }, { ambient: 0 }, outshining.reaches)).toBe('bright');
    const outside = build(state({ dark: DARK, torch: light('torch', 800, torch) }));
    expect(outside.lights).toHaveLength(2);
    expect(lightLevelAt({ x: 900, y: 600 }, { ambient: 0 }, outside.reaches)).toBe('bright');
    // The part of the torch's light that falls into the darkness is swallowed, as before.
    expect(lightLevelAt({ x: 650, y: 600 }, { ambient: 0 }, outside.reaches)).toBe('magical-dark');
  });

  it('hands the engine the areas the rule counts, of the darkness and of the lights it may swallow: the reaches\' own polygons', () => {
    const model = build(state({ dark: DARK, torch: light('torch', 800, torch) }));
    expect(model.lights.map((engine) => engine.area)).toEqual(model.reaches.map((reach) => reach.polygon));
    model.lights.forEach((engine, i) => expect(engine.area).toBe(model.reaches[i]!.polygon));
    // A scene without a darkness hands none on: its lights are as they always were.
    expect(build(state({ torch: light('torch', 800, torch) })).lights[0]).not.toHaveProperty('area');
  });

  it('is put out when a token carries it into the darkness, and a darkness is never put out by another', () => {
    const carried: TokenEntity = { id: 'bearer', kind: 'token', imagePath: 'b.png', x: 560, y: 600, light: torch };
    expect(build(state({ dark: DARK }, { bearer: carried })).lights.map((engine) => engine.key)).toEqual(['light:dark']);
    expect(build(state({ dark: DARK, other: light('other', 560, darkness) })).lights).toHaveLength(2);
  });
});

describe('a vision token inside magical darkness', () => {
  const DARK = light('dark', 500, darkness);
  const regionsOf = (tokens: Record<string, TokenEntity>, lights: Record<string, LightSource> = { dark: DARK }, ambient = 1): string[] =>
    build(state(lights, tokens, ambient)).sight.regions.map((region) => `${region.tokenId}:${region.sense.id}`);

  it('sees nothing with its eyes: not the daylight around the darkness, and not by darkvision that does not see in it', () => {
    expect(regionsOf({ hero: token('hero', 520) })).toEqual([]);
    expect(regionsOf({ hero: token('hero', 520, [{ id: 'dnd5e-darkvision', range: 60 }]) })).toEqual([]);
    // The scene still has a vision token: line of sight hides the map, it does not show all of it.
    expect(build(state({ dark: DARK }, { hero: token('hero', 520) }, 1)).sight.all).toBe(false);
  });

  it('sees with a sense that sees in magical darkness, and with one that needs no eyes', () => {
    expect(regionsOf({ hero: token('hero', 520, [{ id: 'dnd5e-devils-sight', range: 120 }]) })).toEqual(['hero:dnd5e-devils-sight']);
    expect(regionsOf({ hero: token('hero', 520, [{ id: 'dnd5e-truesight', range: 30 }, { id: 'dnd5e-darkvision', range: 60 }]) })).toEqual(['hero:dnd5e-truesight']);
    expect(regionsOf({ hero: token('hero', 520, [{ id: 'dnd5e-tremorsense', range: 30 }]) })).toEqual(['hero:dnd5e-tremorsense']);
    expect(regionsOf({ hero: token('hero', 520, [{ id: 'pathfinder2e-darkvision' }]) })).toEqual(['hero:pathfinder2e-darkvision']);
  });

  it('sees as ever outside the darkness, past it too, and inside one a light outshines where it stands', () => {
    expect(regionsOf({ hero: token('hero', 900) })).toEqual([`hero:${NORMAL_SIGHT.id}`]);
    expect(regionsOf({ hero: token('hero', 520) }, { dark: DARK, sun: light('sun', 540, { ...torch, priority: 1 }) }, 0)).toEqual([`hero:${NORMAL_SIGHT.id}`]);
  });

  it('is still shown to the players within its own space', () => {
    const scene = state({ dark: DARK }, { hero: token('hero', 520) }, 1);
    const builder = new SceneModelBuilder();
    const spots = new SceneSpots().update(builder.update(scene, BOUNDS, measurement, () => RULES).model, scene, measurement, () => RULES);
    expect(spots).toMatchObject([{ x: 520, y: 600 }]);
  });
});
