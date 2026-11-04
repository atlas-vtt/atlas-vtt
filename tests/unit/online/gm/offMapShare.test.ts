import { describe, expect, it } from 'vitest';
import { TOKEN_INTERVAL_MS } from '../../../../src/app/online/gm/TokenShare.ts';
import { sharedSight } from '../../../../src/app/online/gm/sceneInputs.ts';
import { LIGHT_PRESETS } from '../../../../src/app/lighting/lightPresets';
import { GENERIC_SIGHT_RULES } from '../../../../src/app/vision/sightRules';
import { sceneState, shareHarness, token, tokenLists } from './shareHarness.ts';

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
