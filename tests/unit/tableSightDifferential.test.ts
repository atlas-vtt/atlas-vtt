import { describe, expect, it } from 'vitest';
import { resolveMeasurementSettings } from '../../src/app/grid/measurementFormat';
import { BUILT_IN_SENSES } from '../../src/app/gameSystems/senses';
import { SceneModelBuilder, SceneSpots } from '../../src/app/pixi/lighting/sceneModel';
import { tokenPerception } from '../../src/app/pixi/lighting/playerLightingLayers';
import { pierceShapes } from '../../src/app/pixi/lighting/engine/senseDrawing';
import { createViewAtlasStore } from '../../src/app/storeFactory';
import type { TokenEntity } from '../../src/app/types';
import type { Sight } from '../../src/app/vision/sight';
import type { SightRules } from '../../src/app/vision/sightRules';
import { doorsInSight } from '../../src/app/vision/doorSight';
import { exploredShapes } from '../../src/app/vision/exploredShapes';
import { seenSpots } from '../../src/app/vision/perception';
import { SceneModelBuilder as OldBuilder, SceneSpots as OldSpots } from '../oracles/tableSightBaseline/sceneModel';
import { tokenPerception as oldPerception } from '../oracles/tableSightBaseline/playerLightingLayers';
import { seenSpots as oldSpots } from '../oracles/tableSightBaseline/perception';
import { createInMemoryApp } from '../mocks/inMemoryVault';

const BOUNDS = { width: 1000, height: 600 };
const measurement = (): ReturnType<typeof resolveMeasurementSettings> => resolveMeasurementSettings(undefined, null);
const RULES: SightRules = { definitions: BUILT_IN_SENSES['builtin:dnd5e']!, conditions: [{ id: 'blind', name: 'Blinded', effect: 'blinded', color: '#000000' }] };

function random(seed: number): () => number {
  return (): number => { seed = Math.imul(seed, 1664525) + 1013904223 | 0; return (seed >>> 0) / 4294967296; };
}

describe('Table sight compared with the frozen local rules', () => {
  it('preserves GM outputs and changes only hidden contributions across seeded scenes', () => {
    const initial = createViewAtlasStore(createInMemoryApp().app, 'sight-differential').getState();
    for (let seed = 1; seed <= 120; seed++) {
      const rng = random(seed);
      const tokens: Record<string, TokenEntity> = {};
      for (let n = 0; n < seed % 7; n++) {
        const id = `t${n}`;
        tokens[id] = { id, kind: 'token', imagePath: '', x: 20 + rng() * 960, y: 20 + rng() * 560,
          isHidden: seed % 3 === 0 ? false : rng() > 0.45,
          vision: { enabled: rng() > 0.25, range: rng() > 0.2 ? 5 + rng() * 30 : 0,
            senses: rng() > 0.5 ? [{ id: 'dnd5e-darkvision', range: 30 }] : [] },
          conditions: rng() > 0.8 ? ['blind'] : [],
        };
      }
      const state = { ...initial, objects: { ...initial.objects, tokens, walls: {
        wall: { id: 'wall', kind: 'wall' as const, type: 'solid' as const, p1: { x: 500, y: 0 }, p2: { x: 500, y: 260 } },
        door: { id: 'door', kind: 'wall' as const, type: 'door' as const, p1: { x: 500, y: 260 }, p2: { x: 500, y: 330 }, closed: true },
      } }, lighting: { enabled: true, ambient: seed % 2, tokenVision: seed % 11 !== 0 } };
      const current = new SceneModelBuilder().update(state, BOUNDS, measurement, () => RULES).model;
      const original = new OldBuilder().update(state, BOUNDS, measurement, () => RULES).model;
      const expected: Sight = original.sight.all ? original.sight : {
        all: false, regions: original.sight.regions.filter(region => !tokens[region.tokenId]?.isHidden),
      };
      expect(current.gmSight, `GM seed ${seed}`).toEqual(original.sight);
      expect(current.sight, `Table seed ${seed}`).toEqual(expected);
      expect(current.lights).toEqual(original.lights);
      expect(current.reaches).toEqual(original.reaches);
      const options = { conditions: RULES.conditions, held: state.heldTokens };
      const gmSpots = new SceneSpots().update(current, state, measurement, () => RULES, current.gmSight);
      expect(gmSpots).toEqual(new OldSpots().update(original, state, measurement, () => RULES));
      const spots = seenSpots(current.sight, current.ambient, current.reaches, tokens, 70, current.walls, options);
      const expectedSpots = oldSpots(expected, original.ambient, original.reaches, tokens, 70, original.walls, options);
      expect(spots).toEqual(expectedSpots);
      expect(pierceShapes(current.sight, spots)).toEqual(pierceShapes(expected, expectedSpots));
      expect(current.explored).toEqual(exploredShapes(expected, original.ambient, original.reaches));
      expect(doorsInSight(current.walls, current.sight, current.ambient, current.reaches)).toEqual(doorsInSight(original.walls, expected, original.ambient, original.reaches));
      const actualTarget = tokenPerception(current.sight, current.ambient, current.reaches, tokens, options);
      const expectedTarget = oldPerception(expected, original.ambient, original.reaches, tokens, options);
      for (const token of Object.values(tokens)) expect(actualTarget(token.id), `target ${seed}/${token.id}`).toBe(token.isHidden ? 'unseen' : expectedTarget(token.id));
    }
  });
});
