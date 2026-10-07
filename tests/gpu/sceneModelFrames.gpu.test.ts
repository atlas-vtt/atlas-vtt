import { describe, expect, it } from 'vitest';
import { GENERIC_SENSES } from '../../src/app/gameSystems/senses/generic';
import { holdTokens } from '../../src/app/lighting/sightOnDrop';
import type { TokenEntity } from '../../src/app/types';
import type { LightEmission, LightSource, LightZone } from '../../src/app/types/lightingTypes';
import type { SightRules } from '../../src/app/vision/sightRules';
import { sceneModelReference } from '../helpers/sceneModelReference';
import { byteDifferences, tableScenes, visionToken, type TableSceneOptions } from '../helpers/tableSightScene';

type Store = Awaited<ReturnType<ReturnType<typeof tableScenes>['scene']>>['store'];

const GENERIC: SightRules = { definitions: GENERIC_SENSES, conditions: [] };
const DARK = { ambient: 0, exploredMemory: false };

const glow = (color: string, changes: Partial<LightEmission> = {}): LightEmission => ({ bright: 3, dim: 6, color, intensity: 1, animation: 'none', ...changes });
const placed = (id: string, x: number, y: number, emission: LightEmission, changes: Partial<LightSource> = {}): LightSource => ({ id, kind: 'light', x, y, emission, ...changes });
const carrying = (token: TokenEntity, light: LightEmission): TokenEntity => ({ ...token, light });
const place = (store: Store, lights: Record<string, LightSource>, lightZones: Record<string, LightZone> = {}): void => store.setState((state) => ({ objects: { ...state.objects, lights, lightZones } }));

interface FrameCase {
  name: string;
  options: TableSceneOptions;
  /** Store changes made after the scene was built. */
  then?: (store: Store) => void;
}

const CASES: FrameCase[] = [
  { name: 'a coloured torch carried by a vision token', options: { tokens: { party: carrying(visionToken('party', 60), glow('#ff8800')) }, lighting: DARK } },
  { name: 'a coloured beam from a placed lantern', options: { lighting: DARK }, then: (store) => place(store, { lantern: placed('lantern', 40, 60, glow('#3366cc', { bright: 4, dim: 8, angle: 90 }), { rotation: 135 }) }) },
  { name: 'a torch put out by a darkness, beside a token with truesight', options: {
    tokens: { seer: { ...visionToken('seer', 60), vision: { enabled: true, range: 5, senses: [{ id: 'truesight', range: 5 }] } } }, lighting: DARK, rules: GENERIC,
  }, then: (store) => place(store, { torch: placed('torch', 75, 150, glow('#ffaa33')), dark: placed('dark', 60, 150, glow('#ffffff', { bright: 0, dim: 5, darkness: true })) }) },
  { name: 'a zone with ambient light of its own colour', options: { lighting: { ambient: 0.1, exploredMemory: false } }, then: (store) => place(store, {}, {
    hall: { id: 'hall', kind: 'light-zone', ambient: 1, ambientColor: '#88ff88', polygon: [{ x: 20, y: 20 }, { x: 110, y: 20 }, { x: 110, y: 110 }, { x: 20, y: 110 }] },
  }) },
  { name: 'a lamp that wakes when the ambient light falls', options: { lighting: { ambient: 1, exploredMemory: false } }, then: (store) => {
    place(store, { lamp: placed('lamp', 60, 90, glow('#ffcc66'), { activeBelowAmbient: 0.3 }) });
    store.getState().setSceneLighting({ ambient: 0.2 });
  } },
  { name: 'a held token carrying a coloured torch while sight waits for the drop', options: { tokens: { party: carrying(visionToken('party', 60), glow('#cc66ff')) }, lighting: DARK }, then: (store) => {
    holdTokens(store, ['party']);
    store.getState().moveToken('party', 190, 128);
  } },
];

describe('the scene model through the lighting renderer', () => {
  const { scene } = tableScenes();

  it.each(CASES)('draws $name as its previous version did', async ({ options, then }) => {
    const h = await scene(options);
    then?.(h.store);
    const reference = sceneModelReference(h.renderer, h.store.getState(), options.rules);
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

  it('tells a light of another hue from the one the scene has', async () => {
    const { options } = CASES[0]!;
    const h = await scene(options);
    const reference = sceneModelReference(h.renderer, h.store.getState(), options.rules, (lights) => lights.map((light) => ({ ...light, color: [light.color[2], light.color[1], light.color[0]] as const })));
    try {
      reference.engine.setMode('gm');
      expect(byteDifferences(h.reference(reference.engine), h.pixels('gm'))).toBeGreaterThan(0);
    } finally { reference.engine.destroy(); }
  });
});
