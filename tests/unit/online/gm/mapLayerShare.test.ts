import type { GmMessage, SharedInitiative } from '../../../../src/app/online/protocol/index.ts';
import type { CollectionLookup } from '../../../../src/app/gameSystems/mapRules';
import type { DrawingStroke, TokenEntity } from '../../../../src/app/types';
import type { CollectionSettings } from '../../../../src/app/types/collectionSettingsTypes';
import type { InitiativeEntry } from '../../../../src/app/types/initiativeTypes';
import type { ViewState } from '../../../../src/app/types/viewState';
import type { WallSegment } from '../../../../src/app/types/wallTypes';
import { describe, expect, it } from 'vitest';
import { fakeLayers } from './fakeAtlasTab.ts';
import { MAP_LAYER_INTERVAL_MS } from '../../../../src/app/online/gm/MapLayerShare.ts';
import { GENERIC_SOURCE } from './gmLighting.ts';
import { sceneState, shareHarness, token, type Sent } from './shareHarness.ts';

const MAP = { width: 2000, height: 2000 };
const last = <T extends GmMessage['t']>(sent: readonly Sent[], t: T): Extract<GmMessage, { t: T }> | undefined =>
  sent.flatMap(({ body }) => (body.t === t ? [body as Extract<GmMessage, { t: T }>] : [])).at(-1);

const entry = (tokenId: string, order: number, initiative: number): InitiativeEntry => ({
  id: `e_${tokenId}`, tokenId, name: tokenId, initiative, initiativeModifier: 0, imagePath: '', isActive: order === 0, isNPC: false, order,
});

type State = ReturnType<typeof sceneState> & Partial<Pick<ViewState, 'initiative' | 'initiativeTrackerOpen'>>;

function lookup(settings: Partial<CollectionSettings>): CollectionLookup {
  return { getCollectionForMap: () => 'heroes', getCollectionSettings: () => settings as CollectionSettings };
}

async function table(state: State, options: { grid?: Record<string, unknown> | null; collections?: CollectionLookup | null } = {}): Promise<ReturnType<typeof shareHarness> & { show(next: State): Promise<void> }> {
  let current = state;
  const harness = shareHarness(current, new Map([['maps/cave.webp', new Uint8Array([1, 2, 3])]]));
  harness.layers = fakeLayers({ state: () => current, source: GENERIC_SOURCE, bounds: MAP, grid: () => options.grid ?? null, collections: options.collections ?? null });
  harness.share.start();
  await harness.advance(MAP_LAYER_INTERVAL_MS);
  return Object.assign(harness, {
    show: async (next: State): Promise<void> => {
      current = next;
      await harness.set(next);
      await harness.advance(MAP_LAYER_INTERVAL_MS);
    },
  });
}

const FIGHT: ViewState['initiative'] = { entries: [entry('ogre', 1, 12), entry('spy', 2, 15), entry('hero', 0, 18)], currentIndex: 0, round: 3, isActive: true, config: { autoSort: true } };

const fight = (tokens: Record<string, TokenEntity>, extra: Partial<State> = {}): State => ({
  ...sceneState({ objects: { ...sceneState().objects, tokens } }),
  initiative: FIGHT,
  initiativeTrackerOpen: true,
  ...extra,
});

const TOKENS: Record<string, TokenEntity> = {
  hero: token('hero', { vision: { enabled: true }, resources: { hp: { current: 4, max: 10 } } }),
  ogre: token('ogre', { ringColor: '#f00' }),
  spy: token('spy', { isHidden: true }),
};

describe("the map's layers players are sent", () => {
  it('send the grid as Atlas draws it, and none while the GM hides it', async () => {
    const options = { grid: { type: 'hex-horizontal', size: 64, offsetX: 5, offsetY: 6, color: 0x336699, alpha: 0.4, lineWidth: 2, lineType: 'dotted', cellNumbers: { format: 'column-row', opacity: 0.5 }, enabled: true } };
    const shared = await table(sceneState(), options);
    expect(last(shared.sent, 'grid')?.grid).toEqual({
      type: 'hex-horizontal', size: 64, offsetX: 5, offsetY: 6, colour: '#336699', alpha: 0.4, lineWidth: 2, lineType: 'dotted', numbers: { format: 'column-row', opacity: 0.5 },
    });
    options.grid = { ...options.grid, enabled: false };
    await shared.advance(1000);
    expect(last(shared.sent, 'grid')?.grid).toBeNull();
  });

  it('send drawings and texts but those fog covers whole', async () => {
    const pen = (id: string, x: number): DrawingStroke => ({ id, kind: 'drawing', timestamp: 1, type: 'pen', points: [{ x, y: 100 }, { x: x + 100, y: 100 }], color: '#abcdef', width: 4, opacity: 1 });
    const state = sceneState({
      objects: {
        ...sceneState().objects,
        drawings: { inside: pen('inside', 520), across: pen('across', 450), outside: pen('outside', 100) },
        fog: { cover: { id: 'cover', kind: 'fog', timestamp: 1, isErasing: false, type: 'rectangle', x: 500, y: 0, width: 400, height: 400 } },
      },
    });
    const shared = await table(state);
    expect(last(shared.sent, 'annotations')?.drawings.map(({ points }) => points[0])).toEqual([450, 100]);
  });

  it("list every combatant whose token is not hidden, in turn order, as Atlas's player window does", async () => {
    const shared = await table(fight(TOKENS));
    const list = last(shared.sent, 'initiative')?.list as SharedInitiative;
    expect(list.combatants.map(({ initiative }) => initiative)).toEqual([18, 12]);
    expect(list.combatants.map(({ name, turn, hp }) => ({ name, turn, hp }))).toEqual([{ name: 'hero', turn: true, hp: null }, { name: 'ogre', turn: false, hp: null }]);
    expect(list.combatants[1]?.ring).toEqual({ colour: '#ff0000' });
    expect(list).toMatchObject({ isActive: true, round: 3, bySides: false });

    shared.settings = { ...shared.settings, showNames: false };
    await shared.advance(1000);
    expect(last(shared.sent, 'initiative')?.list?.combatants.map(({ name }) => name)).toEqual([null, null]);
  });

  it('show hit points where the collection shows them, and group by side as its rules say', async () => {
    const collections = lookup({ resources: [{ key: 'hp', name: 'HP', field: 'hp', direction: 'drains', color: '#22c55e', defeatedWhenSpent: true, visibleToPlayers: true }], initiative: { mode: 'sides', roll: '1d20', firstSide: 'opponents' } });
    const shared = await table(fight(TOKENS, { initiative: { ...FIGHT, isActive: false } }), { collections });
    const list = last(shared.sent, 'initiative')?.list as SharedInitiative;
    expect(list.combatants.find(({ side }) => side === 'players')?.hp).toEqual({ current: 4, max: 10 });
    expect(list).toMatchObject({ bySides: true, firstSide: 'opponents', activeSide: null });
  });

  it('send no list while the GM\'s tracker is closed or the player view hides it', async () => {
    const shared = await table(fight(TOKENS, { initiativeTrackerOpen: false }));
    expect(last(shared.sent, 'initiative')?.list).toBeNull();
    await shared.show(fight(TOKENS));
    expect(last(shared.sent, 'initiative')?.list).not.toBeNull();
    shared.settings = { ...shared.settings, showInitiative: false };
    await shared.advance(1000);
    expect(last(shared.sent, 'initiative')?.list).toBeNull();
  });

  it('badge the ordinary doors players see in a lit scene, open or closed, never a secret door', async () => {
    const door = (id: string, type: WallSegment['type'], x: number, closed: boolean): WallSegment => ({ id, kind: 'wall', type, p1: { x, y: 500 }, p2: { x: x + 70, y: 500 }, closed });
    const state = sceneState({
      lighting: { enabled: true, ambient: 1 },
      objects: {
        ...sceneState().objects,
        tokens: { hero: token('hero', { x: 400, y: 400, vision: { enabled: true } }) },
        walls: { a: door('a', 'door', 300, true), b: door('b', 'door', 450, false), c: door('c', 'secret-door', 600, false) },
      },
    });
    const shared = await table(state);
    expect(last(shared.sent, 'doors')?.doors).toEqual([{ p: [300, 500, 370, 500], open: false }, { p: [450, 500, 520, 500], open: true }]);
    expect(last(shared.sent, 'sensed')?.tokens).toEqual([]);
  });

  it('send no badges and no outlines for an unlit scene, and everything again to a player who joins', async () => {
    const shared = await table(fight(TOKENS));
    expect(last(shared.sent, 'doors')).toBeUndefined();
    expect(last(shared.sent, 'sensed')).toBeUndefined();
    const before = shared.sent.length;
    shared.share.resend('ben');
    const resent = shared.sent.slice(before).filter(({ to }) => to === 'ben').map(({ body }) => body.t);
    expect(resent).toEqual(expect.arrayContaining(['grid', 'annotations', 'initiative']));
  });
});
