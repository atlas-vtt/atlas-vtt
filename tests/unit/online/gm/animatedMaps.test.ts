import type { GmMessage, SharedLiquid, SharedScene } from '../../../../src/app/online/protocol/index.ts';
import type { SceneState } from '../../../../src/app/online/gm/atlasView.ts';
import type { SeatSource } from '../../../../src/app/online/gm/seatSource.ts';
import type { LiquidSurface } from '../../../../src/app/types/liquidTypes';
import type { SceneLevel } from '../../../../src/app/types/sceneLevelTypes';
import { describe, expect, it } from 'vitest';
import { sha256Hex } from '../../../../src/app/online/gm/assetServe.ts';
import { MAP_LAYER_INTERVAL_MS } from '../../../../src/app/online/gm/MapLayerShare.ts';
import { fakeLayers } from './fakeAtlasTab.ts';
import { fakeStoring, storedRef } from './fakeStoring.ts';
import { GENERIC_SOURCE } from './gmLighting.ts';
import { sceneState, shareHarness, token, type Sent, type ShareHarness } from './shareHarness.ts';

const POSTER = new Uint8Array(40).map((_, index) => index);
const VIDEO = new Uint8Array(5000).map((_, index) => (index * 7) % 256);
const IMAGE = new Uint8Array(30).map((_, index) => 200 - index);

const scenes = (sent: readonly Sent[]): (SharedScene | null)[] => sent.flatMap(({ body }) => (body.t === 'scene' ? [body.scene] : []));
const ofKind = <T extends GmMessage['t']>(sent: readonly Sent[], t: T): Extract<GmMessage, { t: T }>[] => sent.flatMap(({ body }) => (body.t === t ? [body as Extract<GmMessage, { t: T }>] : []));

async function videoTable(background = 'maps/falls.webm'): Promise<ShareHarness> {
  const table = shareHarness(sceneState({ background }), new Map([['maps/falls.webm', POSTER], ['maps/still.webp', IMAGE]]));
  table.videos.set('maps/falls.webm', VIDEO);
  table.share.start();
  await table.settle();
  return table;
}

describe("an animated map's video", () => {
  it('goes beside its poster, which stays the map, both by the ids the store keeps them under', async () => {
    const table = await videoTable();
    expect(scenes(table.sent)).toEqual([{
      id: '000000000000000000000001', lit: false,
      map: await storedRef(POSTER, 'image/png'),
      video: await storedRef(VIDEO, 'video/webm'),
    }]);
  });

  it('leaves with its map', async () => {
    const table = await videoTable();
    await table.set(sceneState({ background: 'maps/still.webp' }));
    expect(scenes(table.sent).at(-1)).not.toHaveProperty('video');
  });

  it('leaves players the poster where there is no video or the store does not keep it', async () => {
    const table = shareHarness(sceneState({ background: 'maps/falls.webm' }), new Map([['maps/falls.webm', POSTER]]));
    table.share.start();
    await table.settle();
    expect(scenes(table.sent)).toEqual([{ id: '000000000000000000000001', lit: false, map: await storedRef(POSTER, 'image/png') }]);

    const refused = await sha256Hex(VIDEO);
    const kept = shareHarness(sceneState({ background: 'maps/falls.webm' }), new Map([['maps/falls.webm', POSTER]]), undefined, undefined, fakeStoring((hash) => hash === refused, () => VIDEO));
    kept.share.start();
    await kept.settle();
    expect(scenes(kept.sent)).toEqual([{ id: '000000000000000000000001', lit: false, map: await storedRef(POSTER, 'image/png') }]);
  });
});

const COLOURS = { surface: '#4f86a8', deep: '#1d3f5c', glint: '#e8f7ff' };
const LAVA = { surface: '#e0531b', deep: '#2a1612', glint: '#ffd27a' };
const square = (x: number, y: number, side = 100): { x: number; y: number }[] => [{ x, y }, { x: x + side, y }, { x: x + side, y: y + side }, { x, y: y + side }];
const surface = (id: string, changes: Partial<LiquidSurface> = {}): LiquidSurface => ({ id, kind: 'liquid', liquid: 'water', polygon: square(0, 0), colors: COLOURS, ...changes });

const POOLS: Record<string, LiquidSurface> = {
  liquid_pool: surface('liquid_pool', { polygon: square(10.123, 20.456, 300), holes: [square(100, 100, 20)], flow: { x: 0, y: 1 } }),
  liquid_lava1: surface('liquid_lava1', { liquid: 'lava', polygon: square(500, 0), colors: LAVA, art: 'engraved', lavaLight: 'light_1' }),
  liquid_lava2: surface('liquid_lava2', { liquid: 'lava', polygon: square(700, 0), colors: LAVA, art: 'engraved', lavaLight: 'light_1' }),
  liquid_broken: { id: 'liquid_broken', kind: 'liquid', liquid: 'oil', polygon: square(0, 0), colors: COLOURS } as unknown as LiquidSurface,
};

const withLiquids = (liquids: Record<string, LiquidSurface> | undefined, changes: Partial<SceneState> = {}): SceneState => {
  const state = sceneState(changes);
  return { ...state, objects: { ...state.objects, ...(liquids !== undefined && { liquids }) } };
};

async function liquidTable(state: SceneState, seats?: SeatSource, images = new Map([['maps/cave.webp', IMAGE]])): Promise<ShareHarness & { show(next: SceneState): Promise<void> }> {
  let current = state;
  const table = shareHarness(current, images, seats);
  table.layers = fakeLayers({ state: () => current, source: GENERIC_SOURCE, bounds: { width: 2000, height: 2000 }, grid: () => null, collections: null });
  table.share.start();
  await table.settle();
  await table.advance(MAP_LAYER_INTERVAL_MS);
  return Object.assign(table, {
    show: async (next: SceneState): Promise<void> => {
      current = next;
      await table.set(next);
      await table.advance(MAP_LAYER_INTERVAL_MS);
    },
  });
}

describe('the liquids that move on the map', () => {
  it('send a river\'s course, rounded as its corners are, and the edges where its water goes on', async () => {
    const river = surface('liquid_river', { polygon: square(0, 0, 300), flow: { x: 1, y: 0 }, course: [{ x: -10.004, y: 150.126 }, { x: 310, y: 150 }], openEdges: [1, 3] });
    const still = surface('liquid_lake', { course: [{ x: 0, y: 0 }, { x: 1, y: 1 }] });
    const table = await liquidTable(withLiquids({ liquid_river: river, liquid_lake: still }));
    const [shared, lake] = ofKind(table.sent, 'liquids')[0]!.liquids;
    expect(shared).toMatchObject({ flow: { x: 1, y: 0 }, course: [-10, 150.13, 310, 150], openEdges: [1, 3] });
    // A course only where the water flows, as Atlas reads it.
    expect(lake?.course).toBeUndefined();
  });

  it('go to players in the look the GM\'s map draws them, a Crayon map\'s as Crayon\'s strokes', async () => {
    const table = await liquidTable(withLiquids({ liquid_lava: surface('liquid_lava', { liquid: 'lava', colors: LAVA, art: 'crayon' }) }));
    expect(ofKind(table.sent, 'liquids')[0]?.liquids[0]?.art).toBe('crayon');
  });

  it('go to players as Atlas reads them, under aliases, with no id of the GM\'s scene', async () => {
    const table = await liquidTable(withLiquids(POOLS));
    const [message] = ofKind(table.sent, 'liquids');
    const liquids = message?.liquids ?? [];
    expect(liquids.map(({ id }) => id).every((id) => /^[0-9a-f]{24}$/.test(id))).toBe(true);
    expect(liquids.map(({ id, ...rest }) => rest)).toEqual([
      { liquid: 'water', polygon: [10.12, 20.46, 310.12, 20.46, 310.12, 320.46, 10.12, 320.46], holes: [[100, 100, 120, 100, 120, 120, 100, 120]], flow: { x: 0, y: 1 }, colours: COLOURS },
      { liquid: 'lava', polygon: [500, 0, 600, 0, 600, 100, 500, 100], colours: LAVA, art: 'engraved', glow: liquids[1]?.glow },
      { liquid: 'lava', polygon: [700, 0, 800, 0, 800, 100, 700, 100], colours: LAVA, art: 'engraved', glow: liquids[1]?.glow },
    ]);
    expect(liquids[1]?.glow).toMatch(/^[0-9a-f]{24}$/);
    expect(JSON.stringify(message)).not.toMatch(/liquid_|light_1/);
  });

  it('go out again only when they change, each keeping its alias while the scene stands', async () => {
    const table = await liquidTable(withLiquids(POOLS));
    const first = ofKind(table.sent, 'liquids')[0]!.liquids;
    await table.show(withLiquids(POOLS, { objects: { ...withLiquids(POOLS).objects, tokens: { hero: token('hero') } } }));
    expect(ofKind(table.sent, 'liquids')).toHaveLength(1);

    const rest = { ...POOLS };
    delete rest.liquid_pool;
    await table.show(withLiquids(rest));
    const second = ofKind(table.sent, 'liquids').at(-1)!.liquids;
    expect(second.map(({ id }) => id)).toEqual(first.slice(1).map(({ id }) => id));

    await table.show(withLiquids({}));
    expect(ofKind(table.sent, 'liquids').at(-1)!.liquids).toEqual([]);
  });

  it('cost no message for a map that has none', async () => {
    const table = await liquidTable(withLiquids(undefined));
    await table.show(withLiquids({}));
    expect(ofKind(table.sent, 'liquids')).toEqual([]);
  });

  it('come again to a player who joins', async () => {
    const table = await liquidTable(withLiquids(POOLS));
    const sent = table.sent.length;
    table.share.resend('bob');
    const resent = table.sent.slice(sent).filter(({ body }) => body.t === 'liquids');
    expect(resent.map(({ to }) => to)).toEqual(['bob']);
    expect(resent[0]?.body).toEqual(ofKind(table.sent, 'liquids')[0]);
  });

  it('of each floor go only to the players on that floor', async () => {
    const ANA = 'a'.repeat(20);
    const BEN = 'b'.repeat(20);
    const levels: SceneLevel[] = [
      { id: 'ground', name: 'Ground', elevation: { bottom: 0, top: 10 }, background: 'maps/ground.webp' },
      { id: 'upper', name: 'Upper', elevation: { bottom: 10, top: 20 }, background: 'maps/upper.webp' },
    ];
    const owners: Readonly<Record<string, string>> = { ana: ANA, ben: BEN };
    const seats: SeatSource = { onlinePlayers: () => [ANA, BEN], ownerOf: (id) => owners[id], claimOf: (_map, id) => (owners[id] === undefined ? null : 'taken') };
    const liquids = { liquid_low: surface('liquid_low', { polygon: square(0, 0) }), liquid_high: surface('liquid_high', { liquid: 'acid', polygon: square(400, 400), level: 'upper' }) };
    const base = withLiquids(liquids, { levels, viewedLevel: 'ground', background: 'maps/ground.webp' });
    const state = { ...base, objects: { ...base.objects, tokens: { ana: token('ana'), ben: token('ben', { level: 'upper' }) } } };
    const table = await liquidTable(state, seats, new Map([['maps/ground.webp', IMAGE], ['maps/upper.webp', POSTER]]));
    table.presented = 'ground';
    await table.advance(1000);
    const of = (player: string): (readonly SharedLiquid[])[] => table.sent.filter(({ to, body }) => body.t === 'liquids' && (to === player || to === undefined)).map(({ body }) => (body as Extract<GmMessage, { t: 'liquids' }>).liquids);
    expect(of(ANA).at(-1)?.map(({ liquid, polygon }) => [liquid, polygon[0]])).toEqual([['water', 0]]);
    expect(of(BEN).at(-1)?.map(({ liquid, polygon }) => [liquid, polygon[0]])).toEqual([['acid', 400]]);
    expect(of(ANA).flat().some(({ liquid }) => liquid === 'acid')).toBe(false);
    expect(of(BEN).flat().some(({ liquid }) => liquid === 'water')).toBe(false);
  });
});
