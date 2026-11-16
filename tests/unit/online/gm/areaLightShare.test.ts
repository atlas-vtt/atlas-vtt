import { describe, expect, it } from 'vitest';
import { sharedSight } from '../../../../src/app/online/gm/sceneInputs.ts';
import { GENERIC_SIGHT_RULES } from '../../../../src/app/vision/sightRules';
import { sceneState } from './shareHarness.ts';

describe('online play shares an area light', () => {
  it('as a light at its middle, its smoulder as a pulse, which every players\' page draws', () => {
    const lava = { id: 'lava', kind: 'light', x: 50, y: 50, area: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }], emission: { bright: 10, dim: 30, color: '#ff7a2a', intensity: 1, animation: 'smoulder' } };
    const state = sceneState({ objects: { ...sceneState().objects, lights: { lava } } as never });
    const [shared] = sharedSight({ state, rules: GENERIC_SIGHT_RULES, shown: new Set(), tokenAlias: (id) => id, lightAlias: (id) => id }).lights;
    expect(shared).toMatchObject({ x: 50, y: 50, emission: { bright: 10, dim: 30, animation: 'pulse' } });
    expect(shared).not.toHaveProperty('area');
  });
});
