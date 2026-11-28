import type { GmMessage } from '../../../../src/app/online/protocol/index.ts';
import type { InitiativeEntry } from '../../../../src/app/types/initiativeTypes';
import type { ViewState } from '../../../../src/app/types/viewState';
import { describe, expect, it } from 'vitest';
import { MAP_LAYER_INTERVAL_MS } from '../../../../src/app/online/gm/MapLayerShare.ts';
import { TOKEN_INTERVAL_MS } from '../../../../src/app/online/gm/TokenShare.ts';
import { parseInitiative } from '../../../../src/app/online/protocol/initiative.ts';
import { boundOwnership } from './fakeSeats.ts';
import { fakeLayers } from './fakeAtlasTab.ts';
import { GENERIC_SOURCE } from './gmLighting.ts';
import { sharedSight } from '../../../../src/app/online/gm/sceneInputs.ts';
import { LIGHT_PRESETS } from '../../../../src/app/lighting/lightPresets';
import { GENERIC_SIGHT_RULES } from '../../../../src/app/vision/sightRules';
import { sceneState, shareHarness, token, tokenLists, type Sent } from './shareHarness.ts';

const ART = new Map([
  ['maps/cave.webp', new Uint8Array([1, 2, 3])],
  ['art/on.webp', new Uint8Array([4, 5, 6])],
  ['art/beside.webp', new Uint8Array([7, 8, 9])],
]);

const withTokens = (...tokens: ReturnType<typeof token>[]): ReturnType<typeof sceneState> =>
  sceneState({ objects: { ...sceneState().objects, tokens: Object.fromEntries(tokens.map((entry) => [entry.id, entry])) } });

describe('online play leaves a combatant kept beside the map off the players\' map', () => {
  it('sends no token for it, whatever the frame reports', async () => {
    const state = withTokens(token('on'), token('beside', { offMap: true, x: -105 }));
    const table = shareHarness(state, ART);
    table.share.start();
    await table.set(state);
    await table.advance(TOKEN_INTERVAL_MS);
    expect(tokenLists(table.sent).at(-1)?.tokens).toHaveLength(1);
  });

  it('sends nothing of its sight or light', () => {
    const torch = LIGHT_PRESETS.torch.emission;
    const state = withTokens(token('beside', { offMap: true, vision: { enabled: true }, light: torch }));
    const sight = sharedSight({ state, rules: GENERIC_SIGHT_RULES, shown: new Set(), tokenAlias: (id) => id, lightAlias: (id) => id });
    expect(sight.tokens).toEqual([]);
    // With every token that sees beside the map, the players' map is not blind for it
    expect(sight.blind).toBeUndefined();
  });
});

const ANA = 'a'.repeat(20);
const entry = (tokenId: string, order: number): InitiativeEntry => ({
  id: `e_${tokenId}`, tokenId, name: tokenId, initiative: 20 - order, initiativeModifier: 0, isActive: order === 0, isNPC: false, order,
});
const last = <T extends GmMessage['t']>(sent: readonly Sent[], t: T): Extract<GmMessage, { t: T }> | undefined =>
  sent.flatMap(({ body }) => (body.t === t ? [body as Extract<GmMessage, { t: T }>] : [])).at(-1);

describe('a player\'s own combatant kept beside the map', () => {
  it('is named to its owner: its card carries the id their own tokens name it by, which no other card does', async () => {
    const tokens = [token('hero'), token('scout', { offMap: true, x: -105 }), token('ogre', { offMap: true, x: -210 })];
    const state = {
      ...withTokens(...tokens),
      initiative: { entries: tokens.map((gm, order) => entry(gm.id, order)), round: 1, isActive: true, config: { autoSort: true } },
      initiativeTrackerOpen: true,
    } as ReturnType<typeof sceneState> & Partial<Pick<ViewState, 'initiative' | 'initiativeTrackerOpen'>>;
    const owners = boundOwnership([{ id: ANA, name: 'Ana' }]);
    owners.welcome([{ id: ANA, name: 'Ana' }]);
    owners.give(['hero', 'scout'], {}, ANA);
    const table = shareHarness(state, ART, owners);
    table.pages.join(ANA);
    table.layers = fakeLayers({ state: () => state, source: GENERIC_SOURCE, bounds: { width: 2000, height: 2000 }, grid: () => null, collections: null });
    table.share.start();
    await table.set(state);
    await table.advance(TOKEN_INTERVAL_MS);
    await table.advance(MAP_LAYER_INTERVAL_MS);
    // As a page reads it
    const [hero, scout, ogre] = parseInitiative(last(table.sent, 'initiative')?.list)?.combatants ?? [];
    const mine = table.pages.of(ANA).last('mine')?.tokens ?? [];
    expect(hero?.token).toBeDefined();
    expect(scout?.token).toBeUndefined();
    expect(scout?.beside).toBeDefined();
    expect([...mine].sort()).toEqual([hero?.token, scout?.beside].sort());
    expect(ogre?.beside).toBeDefined();
    expect(mine).not.toContain(ogre?.beside);
    // Hidden beside the map, it leaves the player's own though the token list stays as it was
    const hidden = { ...state, objects: { ...state.objects, tokens: { ...state.objects.tokens, scout: { ...tokens[1]!, isHidden: true } } } };
    await table.set(hidden);
    await table.advance(TOKEN_INTERVAL_MS);
    expect(table.pages.of(ANA).last('mine')?.tokens).toEqual([hero?.token]);
  });
});
