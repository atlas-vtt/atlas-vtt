import { describe, expect, it } from 'vitest';
import { readLight } from '../../lighting/lightingObjects';
import { beamOf } from '../../lighting/lightBeam';
import type { LightEmission } from '../../types/lightingTypes';
import { activeLights, engineLight } from '../../vision/lightSources';
import { MEASURE_EFFECTS, MEASURE_EFFECT_STARTS } from '../measureEffects';
import { canBeDarkness, colourWithEffect, effectChoice, measureLights, sameMeasureLights, startingLight, toolLook, type KeptLights } from '../measureLights';
import type { KeptMeasure, MeasureShapeKind } from '../measureTypes';

/** A 70 px grid of 5 ft squares, cones a quarter turn wide. */
const SCALE = { unitDistance: 5, cellSize: 70 };
const TORCH: LightEmission = { bright: 20, dim: 40, color: '#ff9a3c', intensity: 1, animation: 'torch' };
const DARK: LightEmission = { bright: 0, dim: 15, color: '#000000', intensity: 1, animation: 'none', darkness: true };

const area = (id: string, shape: MeasureShapeKind, overrides: Partial<KeptMeasure> = {}): KeptMeasure =>
  ({ id, kind: 'measure', shape, points: [{ x: 350, y: 350 }, { x: 630, y: 350 }], ...overrides });
const kept = (...measures: KeptMeasure[]): KeptLights => ({ measures, scale: SCALE, coneAngle: 90 });
const one = (measure: KeptMeasure, tokens = {}): ReturnType<typeof measureLights>[number] | undefined => measureLights(kept(measure), tokens)[0];

describe('the lights kept areas give', () => {
  it('gives none without a light, and never for a ruler', () => {
    expect(measureLights(kept(area('plain', 'circle'), area('path', 'ruler', { light: TORCH })), {})).toEqual([]);
  });

  it('shines from a circle\'s centre, also while the circle is hidden from the players', () => {
    expect(one(area('fire', 'circle', { light: TORCH, hidden: true }))).toEqual({ key: 'measure:fire', x: 350, y: 350, emission: TORCH });
  });

  it('shines one way from a cone\'s apex: as wide as the map\'s cones, the way the cone was dragged', () => {
    const right = one(area('cone', 'cone', { light: TORCH }))!;
    expect(right).toMatchObject({ key: 'measure:cone', x: 350, y: 350, rotation: 90, emission: { ...TORCH, angle: 90 } });
    expect(one(area('down', 'cone', { light: TORCH, points: [{ x: 0, y: 0 }, { x: 0, y: 140 }] }))!.rotation).toBe(180);
    // The engine reads it as the beam of any placed light.
    expect(beamOf(right)?.facing).toBeCloseTo(0);
    // A map whose cones open all around has no beam to give.
    const round = measureLights({ ...kept(area('all', 'cone', { light: TORCH })), coneAngle: 360 }, {})[0]!;
    expect(round.emission.angle).toBeUndefined();
  });

  it('glows from the whole of a square and a line: their outline as an area light around its middle', () => {
    const square = one(area('square', 'square', { light: TORCH }))!;
    expect(square.area).toHaveLength(4);
    expect(square).toMatchObject({ x: 490, y: 350 });
    expect(new Set(square.area!.map(({ x }) => x))).toEqual(new Set([350, 630]));
    expect(new Set(square.area!.map(({ y }) => y))).toEqual(new Set([210, 490]));
    const line = one(area('line', 'line', { light: TORCH, width: 70 }))!;
    expect(new Set(line.area!.map(({ y }) => y))).toEqual(new Set([315, 385]));
    // A line that names no width is one cell wide.
    expect(one(area('thin', 'line', { light: TORCH }))!.area).toEqual(line.area);
    // What a placed light with that area would be: the engine takes it as one, and gives it no beam.
    expect(readLight({ id: 'l', kind: 'light', x: line.x, y: line.y, emission: TORCH, area: line.area })?.area).toEqual(line.area);
    expect(beamOf(line)).toBeUndefined();
    expect(engineLight(line, SCALE).surface).toBe(line.area);
  });

  it('is a magical darkness only on a circle, and as wide as the circle is now', () => {
    expect(MEASURE_EFFECTS.filter((effect) => MEASURE_EFFECT_STARTS[effect].darkness)).toEqual(['shadow']);
    expect((['circle', 'cone', 'square', 'line', 'ruler'] as const).filter(canBeDarkness)).toEqual(['circle']);
    const shadow = one(area('shadow', 'circle', { light: DARK }))!;
    // Four cells of 5 ft, whatever radius the darkness was made with.
    expect(shadow.emission).toEqual({ ...DARK, dim: 20 });
    expect(engineLight(shadow, SCALE)).toMatchObject({ darkness: true, bright: 0, dim: 280 });
    for (const shape of ['cone', 'square', 'line'] as const) expect(one(area(shape, shape, { light: DARK }))).toBeUndefined();
  });

  it('takes the area\'s colour where the area has one', () => {
    expect(one(area('green', 'circle', { light: TORCH, color: '#08b94e' }))!.emission).toEqual({ ...TORCH, color: '#08b94e' });
    expect(one(area('own', 'circle', { light: TORCH }))!.emission).toBe(TORCH);
  });

  it('shines from an aura\'s token as light reads it, reaches as the aura does, and not at all without the token', () => {
    const aura = area('aura', 'circle', { light: DARK, follows: 'paladin', aura: 10 });
    const paladin = { x: 700, y: 140, size: 1 };
    expect(one(aura, { paladin })).toMatchObject({ key: 'measure:aura', x: 700, y: 140, emission: { darkness: true, dim: 12.5 } });
    // A large token's aura starts at the edge of its larger space.
    expect(one(aura, { paladin: { ...paladin, size: 2 } })!.emission.dim).toBeGreaterThan(12.5);
    expect(one(aura, {})).toBeUndefined();
    expect(one(area('lit', 'circle', { light: TORCH, follows: 'paladin', aura: 10 }), { paladin })).toEqual({ key: 'measure:lit', x: 700, y: 140, emission: TORCH });
  });

  it('answers with the same light for an area that did not change, and for an aura whose token stands where it stood', () => {
    const fire = area('fire', 'square', { light: TORCH });
    const aura = area('aura', 'circle', { light: TORCH, follows: 'paladin', aura: 10 });
    const first = measureLights(kept(fire, aura), { paladin: { x: 70, y: 70 } });
    const again = measureLights(kept(fire, aura), { paladin: { x: 70, y: 70 } });
    expect(again[0]).toBe(first[0]);
    expect(again[1]).toBe(first[1]);
    expect(sameMeasureLights(first, again)).toBe(true);
    const moved = measureLights(kept(fire, aura), { paladin: { x: 140, y: 70 } });
    expect(moved[0]).toBe(first[0]);
    expect(sameMeasureLights(first, moved)).toBe(false);
    // A measurement that is another object with the same light (players no longer see it, it has another look) keeps its light.
    const changed = measureLights(kept({ ...fire, hidden: true, effect: 'fire' }, aura), { paladin: { x: 70, y: 70 } });
    expect(changed[0]).toBe(first[0]);
    expect(sameMeasureLights(first, changed)).toBe(true);
    // Its colour, its shape and its light itself are its light.
    for (const other of [{ color: '#08b94e' }, { points: [{ x: 0, y: 0 }, { x: 70, y: 0 }] }, { light: { ...TORCH } }]) {
      expect(sameMeasureLights(first, measureLights(kept({ ...fire, ...other }, aura), { paladin: { x: 70, y: 70 } }))).toBe(false);
    }
  });

  it('stands among the scene\'s lights after the placed and the carried ones', () => {
    const lights = { lamp: { id: 'lamp', kind: 'light' as const, x: 1, y: 2, emission: TORCH } };
    const tokens = { scout: { id: 'scout', kind: 'token' as const, imagePath: '', x: 5, y: 6, light: TORCH } };
    expect(activeLights(lights, tokens, 0, kept(area('fire', 'circle', { light: TORCH }))).map((light) => light.key)).toEqual(['light:lamp', 'token:scout', 'measure:fire']);
    expect(activeLights(lights, tokens).map((light) => light.key)).toEqual(['light:lamp', 'token:scout']);
  });
});

describe('what an area starts with', () => {
  it('lights a circle and a cone to their edge, and dimly as far again', () => {
    expect(startingLight(area('c', 'circle'), null, SCALE, '#ffffff')).toEqual({ bright: 20, dim: 40, color: '#ffffff', intensity: 1, animation: 'none' });
    expect(startingLight(area('c', 'cone'), 'fire', SCALE, '#ec7500')).toEqual({ bright: 20, dim: 40, color: '#ec7500', intensity: 1, animation: 'torch' });
  });

  it('counts a square\'s and a line\'s ranges from their outline: dim as far as the area is thick from its middle, a cell at least, bright half as far', () => {
    // Four cells a side: two cells thick from its middle.
    expect(startingLight(area('s', 'square'), 'radiance', SCALE, '#e0ac00')).toMatchObject({ bright: 5, dim: 10, animation: 'none' });
    // A wall of fire one cell wide still glows a cell past its edge.
    expect(startingLight(area('l', 'line', { width: 70 }), 'fire', SCALE, '#ec7500')).toMatchObject({ bright: 2.5, dim: 5, animation: 'torch' });
    expect(startingLight(area('l', 'line', { width: 420 }), 'lightning', SCALE, '#086ddd')).toMatchObject({ bright: 5, dim: 10, animation: 'torch' });
  });

  it('never reaches farther than a light may on the map', () => {
    const far = startingLight(area('far', 'circle', { points: [{ x: 0, y: 0 }, { x: 7000, y: 0 }] }), null, SCALE, '#ffffff');
    expect(far).toMatchObject({ bright: 500, dim: 585 });
  });

  it('makes a circle with Shadow a darkness, and gives every other shape plain light', () => {
    expect(startingLight(area('c', 'circle'), 'shadow', SCALE, '#7852ee')).toEqual({ bright: 0, dim: 20, color: '#7852ee', intensity: 1, animation: 'none', darkness: true });
    expect(startingLight(area('s', 'square'), 'shadow', SCALE, '#7852ee').darkness).toBeUndefined();
  });

  it('brings an effect\'s usual colour, unless the look the area has was recoloured', () => {
    expect(colourWithEffect(undefined, undefined, 'fire')).toBe('#ec7500');
    expect(colourWithEffect('#e93147', null, 'fire')).toBe('#ec7500');
    expect(colourWithEffect('#ec7500', 'fire', 'frost')).toBe('#8ad1f8');
    // Green fire stays green as lightning; fire in the theme's accent stays in it.
    expect(colourWithEffect('#08b94e', 'fire', 'lightning')).toBe('#08b94e');
    expect(colourWithEffect(null, 'fire', 'lightning')).toBeNull();
  });

  it('changes look, colour and light in one write when an effect is chosen on a lit scene', () => {
    const lit = { scale: SCALE, lit: true, accent: '#7f6df2' };
    const circle = area('c', 'circle');
    expect(effectChoice(circle, 'fire', lit)).toEqual({ effect: 'fire', color: '#ec7500', light: { bright: 20, dim: 40, color: '#ec7500', intensity: 1, animation: 'torch' } });
    // Frost and Mist start without light: one the area had goes.
    expect(effectChoice({ ...circle, light: TORCH }, 'frost', lit)).toEqual({ effect: 'frost', color: '#8ad1f8', light: undefined });
    expect(effectChoice(circle, 'shadow', lit).light).toMatchObject({ darkness: true, dim: 20 });
    expect(effectChoice(area('s', 'square', { light: TORCH }), 'shadow', lit)).toEqual({ effect: 'shadow', color: '#7852ee', light: undefined });
    // A recoloured look keeps its colour, and its light takes it.
    expect(effectChoice({ ...circle, effect: 'fire', color: '#08b94e' }, 'radiance', lit)).toMatchObject({ color: '#08b94e', light: { color: '#08b94e', animation: 'none' } });
    expect(effectChoice({ ...circle, effect: 'fire' }, 'radiance', lit)).toMatchObject({ color: undefined, light: { color: '#7f6df2' } });
  });

  it('leaves the light alone on an unlit scene, and colour and light when the look is taken away', () => {
    const lit = effectChoice(area('c', 'circle', { light: TORCH }), 'frost', { scale: SCALE, lit: false, accent: '#7f6df2' });
    expect(lit).toEqual({ effect: 'frost', color: '#8ad1f8' });
    expect('light' in lit).toBe(false);
    expect(effectChoice(area('c', 'circle', { light: TORCH, effect: 'fire', color: '#ec7500' }), null, { scale: SCALE, lit: true, accent: '#7f6df2' })).toEqual({ effect: undefined });
  });

  it('gives an area kept with the tool the tool\'s effect and the light it starts with, and a ruler neither', () => {
    const lit = { scale: SCALE, lit: true, accent: '#7f6df2' };
    expect(toolLook(area('c', 'circle'), { color: '#08b94e', effect: 'fire' }, lit)).toEqual({ effect: 'fire', light: { bright: 20, dim: 40, color: '#08b94e', intensity: 1, animation: 'torch' } });
    expect(toolLook(area('c', 'circle'), { color: null, effect: 'frost' }, lit)).toEqual({ effect: 'frost' });
    expect(toolLook(area('c', 'circle'), { color: null, effect: 'fire' }, { ...lit, lit: false })).toEqual({ effect: 'fire' });
    expect(toolLook(area('c', 'circle'), { color: null, effect: null }, lit)).toEqual({});
    expect(toolLook(area('r', 'ruler'), { color: null, effect: 'fire' }, lit)).toEqual({});
  });
});
