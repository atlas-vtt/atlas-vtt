import type { ResourceDefinition } from '../../../../src/app/resources/resourceTypes';
import type { TokenEntity } from '../../../../src/app/types';
import { describe, expect, it } from 'vitest';
import { TOKEN_POLL_MS } from '../../../../src/app/online/gm/TokenShare.ts';
import { CONDITIONS, creature, gm, type ControlStoreFactory, RESOURCES } from './controlHarness.ts';
import { STORE_FACTORY } from './realStore.ts';

const { createViewAtlasStore } = (await import(/* @vite-ignore */ STORE_FACTORY)) as { createViewAtlasStore: ControlStoreFactory };

/** A seeded generator (mulberry32), so a failing trial can be replayed by its seed. */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 2 ** 32;
  };
}

const IDS = ['ogre1', 'ogre2', 'bear'] as const;
const TRIALS = 20;
const STEPS = 16;

/**
 * The GM's controls in any order (the map's and a token's own nameplate switches, the map's hidden
 * bars, the grid's switch, the player view's Show nameplates and Show grid, each resource's Show to
 * players, hiding tokens, and values) never send players what Atlas's player window would not show:
 * no name while Show nameplates is off, never a hidden token's name, never a value of a resource
 * players may not see, and the grid only while Show grid is on.
 */
describe("the GM's controls never open more to players than Atlas's player window shows", () => {
  it.each(Array.from({ length: TRIALS }, (_, trial) => trial))('trial %i', async (trial) => {
    const random = seeded(4_000 + trial);
    const pick = <T>(list: readonly T[]): T => list[Math.floor(random() * list.length)] as T;
    const own = (n: number): Partial<TokenEntity> => ({ resources: { hp: { current: 10_000 + n, max: 20_000 + n }, str: { current: 30_000 + n, max: 40_000 + n } } });
    const { store, table, settle, grid } = await gm(createViewAtlasStore, [
      creature('ogre1', 105, { imagePath: 'art/ogre.webp', ...own(0) }), creature('ogre2', 245, { imagePath: 'art/ogre.webp', ...own(1) }), creature('bear', 385, own(2)),
    ]);
    let resources: ResourceDefinition[] = RESOURCES.map((definition) => ({ ...definition }));
    // Every value a resource holds is a number of its own: hp 1xxxx and 2xxxx, str 3xxxx and 4xxxx, each token its own, so a sent value names its token and resource.
    let serial = 100;
    for (let step = 0; step < STEPS; step += 1) {
      const state = store.getState();
      const id = pick(IDS);
      const token = state.objects.tokens[id] as TokenEntity;
      switch (pick(['scene-names', 'token-name', 'hidden-bars', 'grid', 'show-names', 'resource', 'hide', 'values', 'rename'] as const)) {
        case 'scene-names': state.setTokenSettings({ ...state.tokenSettings, showNameplates: !state.tokenSettings.showNameplates }); break;
        case 'token-name': state.updateTokens([{ id, changes: { showNameplate: token.showNameplate !== true } }]); break;
        case 'hidden-bars': state.setTokenSettings({ ...state.tokenSettings, hiddenResources: resources.filter(() => random() < 0.5).map(({ key }) => key) }); break;
        case 'grid': state.setGridVisible(state.grid?.visible === false); break;
        case 'show-names': table.settings = { ...table.settings, showNames: !table.settings.showNames }; break;
        case 'resource': {
          const key = pick(resources).key;
          resources = resources.map((definition) => (definition.key === key ? { ...definition, visibleToPlayers: !definition.visibleToPlayers } : definition));
          table.rules = { resources, conditions: CONDITIONS };
          break;
        }
        case 'hide': state.updateTokens([{ id, changes: { isHidden: token.isHidden !== true } }]); break;
        case 'values': {
          serial += 1;
          state.updateTokens([{ id, changes: own(serial) }]);
          break;
        }
        case 'rename': state.updateTokens([{ id, changes: { name: `Name-${serial}-of-${id}` } }]); break;
      }
      const from = table.sent.length;
      await settle(TOKEN_POLL_MS);
      const sent = table.sent.slice(from).map(({ body }) => JSON.stringify(body)).join('\n');
      const now = store.getState();
      for (const tokenId of IDS) {
        const shown = now.objects.tokens[tokenId] as TokenEntity & { name: string };
        if (!table.settings.showNames || shown.isHidden === true) expect(sent, `step ${step}: name of ${tokenId}`).not.toContain(shown.name);
        for (const definition of resources) {
          const value = shown.resources?.[definition.key];
          if (value !== undefined && (!definition.visibleToPlayers || shown.isHidden === true)) {
            expect(sent, `step ${step}: ${definition.key} of ${tokenId}`).not.toMatch(new RegExp(`"(current|max)":(${value.current}|${value.max})\\b`));
          }
        }
      }
      expect(grid() === null, `step ${step}: grid`).toBe(now.grid?.visible === false);
    }
  });
});
