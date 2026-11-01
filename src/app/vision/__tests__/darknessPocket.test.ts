import { describe, expect, it } from 'vitest';
import { BUILT_IN_SENSES, GENERIC_SENSES } from '../../gameSystems/senses';
import type { MeasurementSettings } from '../../grid/measurementFormat';
import type { TokenEntity } from '../../types';
import type { LightEmission } from '../../types/lightingTypes';
import type { LightLevel } from '../../types/senseTypes';
import type { Point } from '../../types/visionTypes';
import { lightLevelAt } from '../lightLevels';
import { perceive } from '../perception';
import { SceneModelBuilder, type SceneModel } from '../sceneModel';

const ALL_SENSES = [...GENERIC_SENSES, ...Object.values(BUILT_IN_SENSES).flat()];
const CELL = 70;
const BOUNDS = { width: 1024, height: 1024 };
const FEET = (): MeasurementSettings => ({ mode: 'metric', unitType: 'feet', unitDistance: 5, diagonalRule: 'equidistant', rangeBands: [] }) as unknown as MeasurementSettings;
const PURPLE: LightEmission = { bright: 0, dim: 5, color: '#a040ff', intensity: 1, animation: 'none', priority: 1 };
const DARKNESS: LightEmission = { bright: 0, dim: 60, color: '#000000', intensity: 1, animation: 'none', darkness: true };
const A = { x: 700, y: 512 };
const DEEP = { x: 200, y: 512 };

function besideA(offset: Point): Point {
  return { x: A.x + offset.x, y: A.y + offset.y };
}

/** A room of darkness: A carries 5 ft of light that outshines it, B has 5e darkvision and stands `offset` from A. */
function modelWith(offset: Point, senses = ['dnd5e-darkvision']): SceneModel {
  const a = { id: 'a', kind: 'token', imagePath: 'a.png', ...A, size: 1, vision: { enabled: true }, light: PURPLE } as TokenEntity;
  const b = { id: 'b', kind: 'token', imagePath: 'b.png', ...besideA(offset), size: 1, vision: { enabled: true, senses: senses.map((id) => ({ id })) } } as TokenEntity;
  const state = {
    objects: { walls: {}, lights: { dark: { id: 'dark', kind: 'light', x: 512, y: 512, emission: DARKNESS } }, tokens: { a, b } },
    lighting: { enabled: true, ambient: 0 },
    grid: { size: CELL },
    heldTokens: {},
  } as unknown as Parameters<SceneModelBuilder['update']>[0];
  return new SceneModelBuilder().update(state, BOUNDS, FEET, () => ({ definitions: ALL_SENSES, conditions: [] })).model;
}

function levelAt(model: SceneModel, point: Point): LightLevel {
  return lightLevelAt(point, model.ambient, model.reaches);
}

describe('a darkvision token beside one whose light outshines magical darkness', () => {
  it.each([['diagonal', { x: CELL, y: CELL }], ['adjacent, on the light\'s radius', { x: CELL, y: 0 }], ['adjacent, north', { x: 0, y: -CELL }]])('is blind while %s: it stands where the rule counts magical darkness', (_, offset) => {
    const model = modelWith(offset);
    expect(levelAt(model, besideA(offset))).toBe('magical-dark');
    expect(model.sight.regions.filter((region) => region.tokenId === 'b')).toEqual([]);
  });

  it.each([['by a hair', { x: CELL - 0.5, y: 0 }], ['by half a token', { x: 0, y: CELL / 2 }], ['on top', { x: 0, y: 0 }]])('keeps its eyes while overlapping %s, and perceives nothing deep in the darkness', (_, offset) => {
    const model = modelWith(offset);
    expect(levelAt(model, besideA(offset))).not.toBe('magical-dark');
    expect(model.sight.regions.filter((region) => region.tokenId === 'b').map((region) => region.sense.id)).toEqual(['sight', 'dnd5e-darkvision']);
    expect(levelAt(model, DEEP)).toBe('magical-dark');
    expect(perceive(DEEP, model.sight, () => levelAt(model, DEEP))).toBe('unseen');
  });

  it('still perceives what a sense that sees in magical darkness shows from the light', () => {
    const model = modelWith({ x: 35, y: 0 }, ['dnd5e-devils-sight']);
    expect(perceive(DEEP, model.sight, () => levelAt(model, DEEP))).toBe('seen');
  });
});
