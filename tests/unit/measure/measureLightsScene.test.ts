import { describe, expect, it } from 'vitest';
import type { MeasurementSettings } from '../../../src/app/grid/measurementFormat';
import type { KeptMeasure } from '../../../src/app/measure/measureTypes';
import { sharedSight } from '../../../src/app/online/gm/sceneInputs.ts';
import type { LightEmission } from '../../../src/app/types/lightingTypes';
import { lightLevelAt } from '../../../src/app/vision/lightLevels';
import { SceneModelBuilder, type SceneState } from '../../../src/app/vision/sceneModel';
import { GENERIC_SIGHT_RULES } from '../../../src/app/vision/sightRules';
import { sceneState, token } from '../online/gm/shareHarness.ts';

const BOUNDS = { width: 1400, height: 700 };
const MEASUREMENT: MeasurementSettings = { mode: 'metric', unitType: 'feet', unitDistance: 5, ruleDistance: 5, diagonalRule: 'equidistant', rangeBands: [], coneAngle: 90 };
const measurement = (): MeasurementSettings => MEASUREMENT;
const TORCH: LightEmission = { bright: 10, dim: 20, color: '#ff9a3c', intensity: 1, animation: 'none' };

const area = (id: string, overrides: Partial<KeptMeasure> = {}): KeptMeasure => ({ id, kind: 'measure', shape: 'circle', points: [{ x: 350, y: 350 }, { x: 490, y: 350 }], ...overrides });

/** A dark hall with a wall down its middle, and whatever kept measurements a test puts in it. */
function scene(measures: Record<string, KeptMeasure>, tokens: SceneState['objects']['tokens'] = {}): SceneState {
  return {
    objects: { tokens, lights: {}, measures, walls: { divider: { id: 'divider', kind: 'wall', type: 'solid', p1: { x: 700, y: 0 }, p2: { x: 700, y: 700 } } } },
    lighting: { enabled: true, ambient: 0 },
    grid: { enabled: true, size: 70, offsetX: 0, offsetY: 0, opacity: 1 },
    heldTokens: {},
  };
}
const withMeasures = (state: SceneState, measures: Record<string, KeptMeasure>): SceneState => ({ ...state, objects: { ...state.objects, measures } });

describe('the lighting of a scene with kept areas that give light', () => {
  it('lights by them as by any light: the rule counts the floor around a lit circle and stops at the wall', () => {
    const { model } = new SceneModelBuilder().update(scene({ fire: area('fire', { light: TORCH, points: [{ x: 630, y: 350 }, { x: 700, y: 350 }] }) }), BOUNDS, measurement);
    expect(model.lights.map((light) => light.key)).toEqual(['measure:fire']);
    const level = (x: number, y: number): string => lightLevelAt({ x, y }, model.ambient, model.reaches);
    expect(level(560, 350)).toBe('bright');
    expect(level(400, 350)).toBe('dim');
    expect(level(300, 350)).toBe('dark');
    // 70 px past the wall, well within its dim range.
    expect(level(770, 350)).toBe('dark');
  });

  it('builds nothing anew for a measurement that changes in nothing its light reads, and anew for its light', () => {
    const builder = new SceneModelBuilder();
    const plain = area('plain');
    const fire = area('fire', { light: TORCH });
    const start = scene({ plain, fire });
    const first = builder.update(start, BOUNDS, measurement);
    expect(first.rebuilt).toBe(true);
    const same = (measures: Record<string, KeptMeasure>): boolean => !builder.update(withMeasures(start, measures), BOUNDS, measurement).rebuilt;
    // An unlit one recoloured, hidden, given a look or removed; a lit one hidden, or given a look.
    expect(same({ plain: { ...plain, color: '#08b94e', hidden: true, effect: 'mist' }, fire })).toBe(true);
    expect(same({ fire })).toBe(true);
    expect(same({ plain, fire: { ...fire, hidden: true, effect: 'fire', walls: false } })).toBe(true);
    // Its light, its colour (which its light takes) and its place are its light.
    expect(same({ plain, fire: { ...fire, light: { ...TORCH, dim: 30 } } })).toBe(false);
    expect(same({ plain, fire: { ...fire, color: '#08b94e' } })).toBe(false);
    expect(same({ plain, fire: { ...fire, points: [{ x: 420, y: 350 }, { x: 560, y: 350 }] } })).toBe(false);
    expect(same({ plain, fire })).toBe(false);
    expect(same({ plain })).toBe(false);
    expect(builder.update(withMeasures(start, { plain }), BOUNDS, measurement).model.lights).toEqual([]);
  });

  it('moves an aura\'s light with its token, and holds it where a held token was taken from while sight waits for the drop', () => {
    const builder = new SceneModelBuilder();
    const paladin = { id: 'paladin', kind: 'token' as const, imagePath: '', x: 210, y: 210, size: 1 };
    const aura = area('aura', { light: TORCH, follows: 'paladin', aura: 10, points: [{ x: 210, y: 210 }, { x: 385, y: 210 }] });
    const start = scene({ aura }, { paladin });
    expect(builder.update(start, BOUNDS, measurement).model.lights[0]).toMatchObject({ key: 'measure:aura', x: 210, y: 210 });
    const moved: SceneState = { ...start, objects: { ...start.objects, tokens: { paladin: { ...paladin, x: 350 } } } };
    const next = builder.update(moved, BOUNDS, measurement);
    expect(next.rebuilt).toBe(true);
    expect(next.model.lights[0]).toMatchObject({ x: 350, y: 210 });
    // Sight on drop: the token is held at (350, 210) and dragged on; its aura's light waits with its own.
    const waiting: SceneState = { ...moved, lighting: { enabled: true, ambient: 0, sightOnDrop: true }, heldTokens: { paladin: { x: 350, y: 210 } } };
    builder.update(waiting, BOUNDS, measurement);
    const dragged = builder.update({ ...waiting, objects: { ...waiting.objects, tokens: { paladin: { ...paladin, x: 560 } } } }, BOUNDS, measurement);
    expect(dragged.rebuilt).toBe(false);
    expect(dragged.model.lights[0]).toMatchObject({ x: 350, y: 210 });
  });

  it('puts a light out that stands in the darkness of a kept circle', () => {
    const shadow = area('shadow', { light: { bright: 0, dim: 5, color: '#000000', intensity: 1, animation: 'none', darkness: true } });
    const state = scene({ shadow });
    state.objects.lights = { lamp: { id: 'lamp', kind: 'light', x: 400, y: 350, emission: TORCH } };
    const { model } = new SceneModelBuilder().update(state, BOUNDS, measurement);
    // The circle is two cells wide: the darkness is as wide, whatever radius it was made with.
    expect(model.lights.map((light) => [light.key, light.darkness === true, light.dim])).toEqual([['measure:shadow', true, 140]]);
    expect(lightLevelAt({ x: 400, y: 350 }, model.ambient, model.reaches)).toBe('magical-dark');
  });
});

describe('online play shares the lights of kept areas', () => {
  const share = (state: ReturnType<typeof sceneState>): ReturnType<typeof sharedSight>['lights'] =>
    sharedSight({ state, rules: GENERIC_SIGHT_RULES, shown: new Set(), tokenAlias: (id) => id, lightAlias: (id) => `alias:${id}`, measurement: MEASUREMENT }).lights;
  const objects = (measures: Record<string, KeptMeasure>, tokens = {}): ReturnType<typeof sceneState>['objects'] => ({ ...sceneState().objects, tokens, measures });
  const grid = { enabled: true, size: 70, offsetX: 0, offsetY: 0, opacity: 1 } as ReturnType<typeof sceneState>['grid'];

  it('a circle at its centre, a cone as a beam, a square at its middle with the outline it glows from, a hidden one too, and never by its own id', () => {
    const lights = share(sceneState({ grid, objects: objects({
      fire: area('fire', { light: TORCH, hidden: true }),
      cone: area('cone', { shape: 'cone', light: { ...TORCH, animation: 'smoulder' } }),
      square: area('square', { shape: 'square', light: TORCH }),
      plain: area('plain'),
    }) }));
    expect(lights).toEqual([
      { id: 'alias:measure:fire', x: 350, y: 350, emission: TORCH },
      { id: 'alias:measure:cone', x: 350, y: 350, emission: { ...TORCH, angle: 90, animation: 'pulse' }, rotation: 90 },
      { id: 'alias:measure:square', x: 420, y: 350, emission: TORCH, area: [350, 280, 350, 420, 490, 420, 490, 280] },
    ]);
  });

  it('an aura\'s where light reads its token, and none for the aura of a hidden token', () => {
    const aura = area('aura', { light: TORCH, follows: 'paladin', aura: 10 });
    const lighting = { enabled: true, ambient: 0, sightOnDrop: true };
    const held = sceneState({ grid, lighting, heldTokens: { paladin: { x: 140, y: 140 } }, objects: objects({ aura }, { paladin: token('paladin', { x: 420, y: 140 }) }) });
    expect(share(held)).toEqual([{ id: 'alias:measure:aura', x: 140, y: 140, emission: TORCH }]);
    expect(share(sceneState({ grid, lighting, objects: objects({ aura }, { paladin: token('paladin', { isHidden: true }) }) }))).toEqual([]);
  });

  it('an aura\'s names its token while players are sent that token, so their page keeps the light on it', () => {
    const aura = area('aura', { light: TORCH, follows: 'paladin', aura: 10 });
    const state = sceneState({ grid, objects: objects({ aura }, { paladin: token('paladin', { x: 420, y: 140 }) }) });
    const sight = sharedSight({ state, rules: GENERIC_SIGHT_RULES, shown: new Set(['paladin']), tokenAlias: (id) => `alias:${id}`, lightAlias: (id) => `alias:${id}`, measurement: MEASUREMENT });
    expect(sight.tokens.map(({ id }) => id)).toEqual(['alias:paladin']);
    expect(sight.lights).toEqual([{ id: 'alias:measure:aura', x: 420, y: 140, emission: TORCH, token: 'alias:paladin' }]);
    // A token players get nothing of is named to nobody: its aura's light stands where it is told.
    expect(share(state)).toEqual([{ id: 'alias:measure:aura', x: 420, y: 140, emission: TORCH }]);
  });

  it('none while the map\'s rules are not known', () => {
    const state = sceneState({ grid, objects: objects({ fire: area('fire', { light: TORCH }) }) });
    expect(sharedSight({ state, rules: GENERIC_SIGHT_RULES, shown: new Set(), tokenAlias: (id) => id, lightAlias: (id) => id }).lights).toEqual([]);
  });
});
