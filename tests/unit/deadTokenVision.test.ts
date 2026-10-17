import { describe, expect, it } from 'vitest';
import { DND_5E } from '../../src/app/gameSystems/presets/dnd5e';
import { resolveMeasurementSettings } from '../../src/app/grid/measurementFormat';
import { LIGHT_PRESETS } from '../../src/app/lighting/lightPresets';
import { unitScaleOf } from '../../src/app/lighting/lightingUnits';
import type { TokenEntity } from '../../src/app/types';
import { SceneModelBuilder, SceneSpots, type SceneState } from '../../src/app/vision/sceneModel';
import { computeSight, sightSources } from '../../src/app/vision/sight';
import type { SightRules } from '../../src/app/vision/sightRules';
import { tokenPerception } from '../../src/app/vision/tokenPerception';
import { GM_SIGHT_POLICY, PLAYER_SIGHT_POLICY } from '../../src/app/vision/tokenSightPolicy';
import { DEAD_CONDITION } from '../../src/app/gameSystems/deadCondition';

const BOUNDS = { width: 2000, height: 1200 };
const measurement = (): ReturnType<typeof resolveMeasurementSettings> => resolveMeasurementSettings(undefined, null);
const RULES: SightRules = { definitions: DND_5E.rules.senses!, conditions: DND_5E.rules.conditions };
const DEAD = 'dnd5e-dead';
const hero: TokenEntity = { id: 'hero', kind: 'character', name: 'Hero', imagePath: '', x: 500, y: 600, vision: { enabled: true, range: 10 } };

function state(tokens: Record<string, TokenEntity>, ambient = 1): SceneState {
  return { objects: { walls: {}, lights: {}, lightZones: {}, tokens }, lighting: { enabled: true, ambient }, grid: null, heldTokens: {} };
}

function build(scene: SceneState, builder = new SceneModelBuilder()): ReturnType<SceneModelBuilder['update']>['model'] {
  return builder.update(scene, BOUNDS, measurement, () => RULES).model;
}

describe('a dead token with vision enabled', () => {
  it('also loses sight and its footprint in a scene with no game system', () => {
    const scene = state({ hero: { ...hero, conditions: [DEAD_CONDITION.id] } });
    const model = new SceneModelBuilder().update(scene, BOUNDS, measurement).model;
    expect(model.sight).toEqual({ all: false, regions: [] });
    expect(new SceneSpots().update(model, scene, measurement)).toEqual([]);
    expect(tokenPerception(model.sight, model.ambient, model.reaches, scene.objects.tokens)('hero')).toBe('unseen');
  });

  it.each([PLAYER_SIGHT_POLICY, GM_SIGHT_POLICY])('contributes no normal sight or special senses', (policy) => {
    const dead: TokenEntity = { ...hero, conditions: [DEAD], vision: { enabled: true, senses: [{ id: 'dnd5e-blindsight', range: 60 }, { id: 'dnd5e-tremorsense', range: 60 }, { id: 'dnd5e-truesight', range: 60 }] } };
    const sources = sightSources({ hero: dead }, unitScaleOf(measurement(), null), BOUNDS, RULES, policy);
    expect(sources).toEqual([{ tokenId: 'hero', origin: { x: 500, y: 600 }, range: 0, senses: [] }]);
    expect(computeSight(sources, [])).toEqual({ all: false, regions: [] });
  });

  it('does not reveal its footprint, its surroundings or new explored memory', () => {
    const scene = state({ hero: { ...hero, conditions: [DEAD] } });
    const model = build(scene);
    expect(model.sight).toEqual({ all: false, regions: [] });
    expect(model.gmSight).toEqual({ all: false, regions: [] });
    expect(model.explored).toBeNull();
    expect(new SceneSpots().update(model, scene, measurement, () => RULES)).toEqual([]);
    expect(tokenPerception(model.sight, model.ambient, model.reaches, scene.objects.tokens, { conditions: RULES.conditions })('hero')).toBe('unseen');
  });

  it('remains visible to a living party member, whose vision is the only active contribution', () => {
    const corpse = { ...hero, conditions: [DEAD] };
    const observer = { ...hero, id: 'observer', x: 550 };
    const scene = state({ hero: corpse, observer });
    const model = build(scene);
    expect(model.sight.regions.map((region) => region.tokenId)).toEqual(['observer']);
    expect(tokenPerception(model.sight, model.ambient, model.reaches, scene.objects.tokens, { conditions: RULES.conditions })('hero')).toBe('seen');
    const farScene = state({ hero: corpse, observer: { ...observer, x: 1500 } });
    const far = build(farScene);
    expect(tokenPerception(far.sight, far.ambient, far.reaches, farScene.objects.tokens, { conditions: RULES.conditions })('hero')).toBe('unseen');
  });

  it('updates immediately when Dead is added or removed, without changing vision settings', () => {
    const builder = new SceneModelBuilder();
    const initial = state({ hero });
    expect(build(initial, builder).sight.regions).not.toHaveLength(0);
    const killed = { ...initial, objects: { ...initial.objects, tokens: { hero: { ...hero, conditions: [DEAD] } } } };
    expect(build(killed, builder).sight.regions).toHaveLength(0);
    const revived = { ...killed, objects: { ...killed.objects, tokens: { hero: { ...hero, conditions: [] } } } };
    expect(build(revived, builder).sight.regions).not.toHaveLength(0);
    expect(revived.objects.tokens.hero.vision).toBe(hero.vision);
  });

  it.each([false, true])('remains blinded after returning from the dead (blindsight=%s)', (blindsight) => {
    const builder = new SceneModelBuilder();
    const blinded: TokenEntity = {
      ...hero,
      conditions: ['dnd5e-blinded'],
      vision: { ...hero.vision!, senses: blindsight ? [{ id: 'dnd5e-blindsight', range: 60 }] : [] },
    };
    const initial = state({ hero: blinded });
    const before = build(initial, builder);
    const killed = { ...initial, objects: { ...initial.objects, tokens: { hero: { ...blinded, conditions: [...blinded.conditions!, DEAD] } } } };
    expect(build(killed, builder).sight).toEqual({ all: false, regions: [] });

    const revived = { ...killed, objects: { ...killed.objects, tokens: { hero: { ...blinded, resources: { hp: { current: 1, max: 10 } } } } } };
    const after = build(revived, builder);
    expect(after.sight).toEqual(before.sight);
    expect(after.gmSight).toEqual(before.gmSight);
    expect(after.sight.regions.map((region) => region.sense.id)).toEqual(blindsight ? ['dnd5e-blindsight'] : []);
    expect(revived.objects.tokens.hero.conditions).toEqual(['dnd5e-blinded']);
    expect(revived.objects.tokens.hero.vision).toBe(blinded.vision);
  });

  it('keeps carried lights shining without giving the corpse vision', () => {
    const scene = state({ hero: { ...hero, conditions: [DEAD], light: LIGHT_PRESETS.torch.emission } }, 0);
    const model = build(scene);
    expect(model.lights).toHaveLength(1);
    expect(model.reaches).toHaveLength(1);
    expect(model.sight).toEqual({ all: false, regions: [] });
    expect(new SceneSpots().update(model, scene, measurement, () => RULES)).toEqual([]);
  });

  it('keeps Blinded distinct: blindsight still works while blinded', () => {
    const blinded = { ...hero, conditions: ['dnd5e-blinded'], vision: { enabled: true, senses: [{ id: 'dnd5e-blindsight', range: 60 }] } };
    const sources = sightSources({ hero: blinded }, unitScaleOf(measurement(), null), BOUNDS, RULES);
    expect(computeSight(sources, []).regions.map((region) => region.sense.id)).toEqual(['dnd5e-blindsight']);
  });

  it('lets another system condition use No vision without depending on its name or id', () => {
    const unconscious = { id: 'custom-unconscious', name: 'Unconscious', color: '#000000', effect: 'no-vision' as const };
    const rules = { ...RULES, conditions: [unconscious] };
    const tokens = { hero: { ...hero, conditions: [unconscious.id] } };
    const sources = sightSources(tokens, unitScaleOf(measurement(), null), BOUNDS, rules);
    const sight = computeSight(sources, []);
    expect(sight).toEqual({ all: false, regions: [] });
    expect(tokenPerception(sight, { ambient: 1 }, [], tokens, { conditions: rules.conditions })('hero')).toBe('unseen');
  });
});
