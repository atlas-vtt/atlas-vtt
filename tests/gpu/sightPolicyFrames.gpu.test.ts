import { describe, expect, it } from 'vitest';
import { BUILT_IN_SENSES } from '../../src/app/gameSystems/senses';
import { GENERIC_SENSES } from '../../src/app/gameSystems/senses/generic';
import { holdTokens } from '../../src/app/lighting/sightOnDrop';
import type { TokenEntity } from '../../src/app/types';
import type { SightRules } from '../../src/app/vision/sightRules';
import { sightPolicyReference } from '../helpers/sightPolicyReference';
import { byteDifferences, tableScenes, visionToken, type TableSceneOptions } from '../helpers/tableSightScene';

const BLIND = { id: 'blind', name: 'Blinded', color: '#000000', effect: 'blinded' as const };
const GENERIC: SightRules = { definitions: GENERIC_SENSES, conditions: [BLIND] };
const PATHFINDER: SightRules = { definitions: BUILT_IN_SENSES['builtin:pathfinder2e']!, conditions: [BLIND] };

const sensing = (token: TokenEntity, id: string): TokenEntity => ({ ...token, vision: { enabled: true, range: 5, senses: [{ id, range: 5 }] } });
const plain = (id: string, x: number): TokenEntity => ({ id, kind: 'token', imagePath: '', x, y: 128, size: 1, layer: 0, rotation: 0 });

interface FrameCase {
  name: string;
  options: TableSceneOptions;
  /** Store changes made after the scene was built. */
  then?: (store: Awaited<ReturnType<ReturnType<typeof tableScenes>['scene']>>['store']) => void;
}

const DARK = { ambient: 0, exploredMemory: false };
const CASES: FrameCase[] = [
  { name: 'one visible vision token', options: { tokens: { party: visionToken('party', 60) }, lighting: { exploredMemory: false } } },
  { name: 'a hidden source alone', options: { tokens: { hidden: visionToken('hidden', 190, true) }, lighting: { exploredMemory: false } } },
  { name: 'visible and hidden sources with darkvision at night', options: { tokens: {
    party: sensing(visionToken('party', 60), 'darkvision'), hidden: sensing(visionToken('hidden', 190, true), 'darkvision'),
  }, lighting: DARK, rules: GENERIC } },
  { name: 'a blinded party token in the dark that only the GM\'s hidden token sees', options: { tokens: {
    party: { ...visionToken('party', 60), conditions: ['blind'] }, watcher: sensing(visionToken('watcher', 90, true), 'darkvision'),
  }, lighting: DARK, rules: GENERIC } },
  { name: 'a precise creature sense showing a token without vision', options: { tokens: {
    bat: sensing(visionToken('bat', 60), 'pathfinder2e-echolocation'), prey: plain('prey', 90),
  }, lighting: DARK, rules: PATHFINDER } },
  { name: 'no vision token', options: { tokens: { prey: plain('prey', 90) }, lighting: { exploredMemory: false } } },
  { name: 'token vision off with a hidden source', options: { tokens: { hidden: visionToken('hidden', 190, true) }, lighting: { tokenVision: false, exploredMemory: false } } },
  { name: 'a held token moved while sight waits for the drop', options: { tokens: { party: visionToken('party', 60) }, lighting: { exploredMemory: false } }, then: (store) => {
    holdTokens(store, ['party']);
    store.getState().moveToken('party', 190, 128);
  } },
  { name: 'a hidden token carrying magical darkness beside a truesight source', options: { tokens: {
    carrier: { ...visionToken('carrier', 190, true), light: { bright: 0, dim: 5, color: '#ffffff', intensity: 1, animation: 'none', darkness: true } },
    seer: sensing(visionToken('seer', 180), 'truesight'),
  }, lighting: DARK, rules: GENERIC } },
];

describe('sight policies through the lighting renderer', () => {
  const { scene } = tableScenes();

  it.each(CASES)('draws $name as the previous sight rules did', async ({ options, then }) => {
    const h = await scene(options);
    then?.(h.store);
    const reference = sightPolicyReference(h.renderer, h.store.getState(), options.rules);
    try {
      expect(h.lighting.currentSight()).toEqual(reference.sight);
      reference.engine.setMode('gm');
      const gm = h.reference(reference.engine);
      reference.engine.setMode('player');
      const players = h.reference(reference.engine);
      for (let i = 0; i < 3; i++) {
        expect(byteDifferences(gm, h.pixels('gm'))).toBe(0);
        expect(byteDifferences(players, h.pixels('player'))).toBe(0);
        expect(byteDifferences(gm, h.thumbnail())).toBe(0);
      }
    } finally { reference.engine.destroy(); }
  });

  it('tells the GM\'s footprints from the players\' in the GM frame', async () => {
    const { options } = CASES[3]!;
    const h = await scene(options);
    const reference = sightPolicyReference(h.renderer, h.store.getState(), options.rules, true);
    try {
      reference.engine.setMode('gm');
      expect(byteDifferences(h.reference(reference.engine), h.pixels('gm'))).toBeGreaterThan(0);
    } finally { reference.engine.destroy(); }
  });
});
