import type { GmMessage, SharedInitiative } from '../../../../src/app/online/protocol/index.ts';
import type { TokenEntity } from '../../../../src/app/types';
import type { InitiativeEntry } from '../../../../src/app/types/initiativeTypes';
import type { ViewState } from '../../../../src/app/types/viewState';
import { describe, expect, it } from 'vitest';
import { fakeLayers } from './fakeAtlasTab.ts';
import { MAP_LAYER_INTERVAL_MS } from '../../../../src/app/online/gm/MapLayerShare.ts';
import { TOKEN_INTERVAL_MS } from '../../../../src/app/online/gm/TokenShare.ts';
import { sharedInitiative } from '../../../../src/app/online/gm/initiativeInputs.ts';
import { parseInitiative } from '../../../../src/app/online/protocol/initiative.ts';
import { GENERIC_SOURCE } from './gmLighting.ts';
import { sceneState, shareHarness, token, tokenLists, type Sent } from './shareHarness.ts';

const last = <T extends GmMessage['t']>(sent: readonly Sent[], t: T): Extract<GmMessage, { t: T }> | undefined =>
  sent.flatMap(({ body }) => (body.t === t ? [body as Extract<GmMessage, { t: T }>] : [])).at(-1);

const entry = (tokenId: string, order: number): InitiativeEntry => ({
  id: `e_${tokenId}`, tokenId, name: tokenId, initiative: 20 - order, initiativeModifier: 0, imagePath: 'art/goblin.webp', isActive: order === 0, isNPC: true, order,
});
/** A goblin: every one shares the artwork, so they are look-alikes. */
const goblin = (id: string, instanceNumber: number, extra: Partial<TokenEntity> = {}): TokenEntity =>
  token(id, { imagePath: 'art/goblin.webp', instanceNumber, x: 100 * instanceNumber, ...extra } as Partial<TokenEntity>);

type State = ReturnType<typeof sceneState> & Partial<Pick<ViewState, 'initiative' | 'initiativeTrackerOpen'>>;

const fight = (tokens: Record<string, TokenEntity>): State => ({
  ...sceneState({ objects: { ...sceneState().objects, tokens } }),
  initiative: { entries: Object.keys(tokens).map(entry), currentIndex: 0, round: 1, isActive: true, config: { autoSort: true } },
  initiativeTrackerOpen: true,
});

async function shared(state: State, dock: 'left' | 'right' = 'right'): Promise<{ list: SharedInitiative; badges: (number | null)[] }> {
  const harness = shareHarness(state, new Map([['maps/cave.webp', new Uint8Array([1, 2, 3])]]));
  harness.settings = { ...harness.settings, initiativeDock: dock };
  harness.layers = fakeLayers({ state: () => state, source: GENERIC_SOURCE, bounds: { width: 2000, height: 2000 }, grid: () => null, collections: null });
  harness.share.start();
  await harness.advance(TOKEN_INTERVAL_MS);
  await harness.advance(MAP_LAYER_INTERVAL_MS);
  const list = last(harness.sent, 'initiative')?.list as SharedInitiative;
  const badges = (tokenLists(harness.sent).at(-1)?.tokens ?? []).sort((a, b) => a.x - b.x).map((shown) => shown.badge);
  return { list, badges };
}

describe('the look-alike numbers on the online players\' list', () => {
  it('are the GM\'s numbers of the tokens they see', async () => {
    const { list, badges } = await shared(fight({ g1: goblin('g1', 1), g2: goblin('g2', 2) }));
    expect(list.combatants.map((combatant) => combatant.instance)).toEqual([1, 2]);
    expect(badges).toEqual([1, 2]);
  });

  it('keep the GM\'s number on a token whose look-alike is hidden, which shows them none', async () => {
    // The GM numbers them 1, 2, 3; players see the first and the third, numbered as the GM numbers them
    const { list, badges } = await shared(fight({ g1: goblin('g1', 1), g2: goblin('g2', 2, { isHidden: true }), g3: goblin('g3', 3) }));
    expect(list.combatants.map((combatant) => [combatant.name, combatant.instance])).toEqual([['g1', 1], ['g3', 3]]);
    expect(badges).toEqual([1, 3]);
    // Alone in their view a look-alike still shows the GM's number
    const alone = await shared(fight({ g1: goblin('g1', 1), g2: goblin('g2', 2, { isHidden: true }) }));
    expect(alone.list.combatants.map((combatant) => combatant.instance)).toEqual([1]);
    expect(alone.badges).toEqual([1]);
  });

  it('show none where the GM\'s map shows none: one token of its art, or badges off', async () => {
    const single = await shared(fight({ g1: goblin('g1', 1) }));
    expect(single.badges).toEqual([null]);
    const off = fight({ g1: goblin('g1', 1), g2: goblin('g2', 2) });
    const { badges } = await shared({ ...off, tokenSettings: { showInstanceBadges: false } } as State);
    expect(badges).toEqual([null, null]);
  });

  it('give a combatant beside the map the players\' list shows the GM\'s number, as Atlas\'s player window does', async () => {
    const { list, badges } = await shared(fight({ g1: goblin('g1', 1), g2: goblin('g2', 2, { offMap: true } as Partial<TokenEntity>) }));
    expect(list.combatants.map((combatant) => combatant.instance)).toEqual([1, 2]);
    expect(badges).toEqual([1]);
  });
});

describe('the edge the online players\' list stands at', () => {
  it('is sent only where the GM docked the lists at the left', async () => {
    expect((await shared(fight({ g1: goblin('g1', 1) }), 'left')).list.dock).toBe('left');
    expect((await shared(fight({ g1: goblin('g1', 1) }))).list).not.toHaveProperty('dock');
  });
});

describe('reading the new fields', () => {
  const base = { isActive: true, round: 1, bySides: false, firstSide: 'players', activeSide: null };
  const combatant = { initiative: 12, name: null, turn: false, sitsOut: false, art: null, ring: null, side: 'opponents', hp: null };

  it('takes a whole look-alike number within bounds and only "left" as the dock, and reads anything else as unset', () => {
    const read = (instance: unknown, dock: unknown): SharedInitiative | null | undefined => parseInitiative({ ...base, dock, combatants: [{ ...combatant, instance }] });
    expect(read(3, 'left')).toMatchObject({ dock: 'left', combatants: [{ instance: 3 }] });
    for (const instance of [0, -1, 1.5, 10_001, '2', Number.NaN, null]) expect(read(instance, 'left')?.combatants[0], String(instance)).not.toHaveProperty('instance');
    for (const dock of ['right', 'LEFT', 1, null]) expect(read(1, dock), String(dock)).not.toHaveProperty('dock');
  });

  it('sends no number the badge does not give, and only whole numbers within bounds', () => {
    const inputs = { state: fight({ g1: goblin('g1', 1) }), shown: true, showNames: false, rules: null, art: () => null };
    expect(sharedInitiative({ ...inputs, badge: () => 4 })?.combatants[0]?.instance).toBe(4);
    for (const badge of [null, 0, 2.5, 20_000]) expect(sharedInitiative({ ...inputs, badge: () => badge })?.combatants[0]).not.toHaveProperty('instance');
  });

  it('names the token a card brings into view only where the players know it, by the id they know', () => {
    const inputs = { state: fight({ g1: goblin('g1', 1) }), shown: true, showNames: false, rules: null, art: () => null };
    expect(sharedInitiative({ ...inputs, tokenAlias: (id) => (id === 'g1' ? 'a1b2c3d4e5f6a7b8c9d0e1f2' : undefined) })?.combatants[0]?.token).toBe('a1b2c3d4e5f6a7b8c9d0e1f2');
    expect(sharedInitiative({ ...inputs, tokenAlias: () => undefined })?.combatants[0]).not.toHaveProperty('token');
    const read = (token: unknown): unknown => parseInitiative({ ...base, combatants: [{ ...combatant, token }] })?.combatants[0];
    expect(read('a1b2c3d4e5f6a7b8c9d0e1f2')).toMatchObject({ token: 'a1b2c3d4e5f6a7b8c9d0e1f2' });
    for (const token of ['', 'has space', 1, null]) expect(read(token), String(token)).not.toHaveProperty('token');
  });
});
