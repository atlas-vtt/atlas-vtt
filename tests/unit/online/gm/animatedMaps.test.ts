import { ASSET_CHUNK_BYTES, MAX_ASSET_BYTES, type GmMessage, type SharedLiquid, type SharedScene } from '../../../../src/app/online/protocol/index.ts';
import type { App } from 'obsidian';
import type { SceneState } from '../../../../src/app/online/gm/atlasView.ts';
import type { SeatSource } from '../../../../src/app/online/gm/seatSource.ts';
import type { LiquidSurface } from '../../../../src/app/types/liquidTypes';
import type { SceneLevel } from '../../../../src/app/types/sceneLevelTypes';
import { describe, expect, it } from 'vitest';
import { sha256Hex } from '../../../../src/app/online/gm/assetServe.ts';
import { MAP_LAYER_INTERVAL_MS } from '../../../../src/app/online/gm/MapLayerShare.ts';
import { REPEAT_REQUEST_MS } from '../../../../src/app/online/gm/SceneShare.ts';
import { readVaultVideo } from '../../../../src/app/online/gm/vaultImage.ts';
import { fakeLayers } from './fakeAtlasTab.ts';
import { GENERIC_SOURCE } from './gmLighting.ts';
import { sceneState, shareHarness, token, type Sent, type ShareHarness } from './shareHarness.ts';

const POSTER = new Uint8Array(40).map((_, index) => index);
const VIDEO = new Uint8Array(ASSET_CHUNK_BYTES + 7).map((_, index) => (index * 7) % 256);
const IMAGE = new Uint8Array(30).map((_, index) => 200 - index);

const scenes = (sent: readonly Sent[]): (SharedScene | null)[] => sent.flatMap(({ body }) => (body.t === 'scene' ? [body.scene] : []));
const ofKind = <T extends GmMessage['t']>(sent: readonly Sent[], t: T): Extract<GmMessage, { t: T }>[] => sent.flatMap(({ body }) => (body.t === t ? [body as Extract<GmMessage, { t: T }>] : []));
/** The bytes of the chunks of one asset sent, joined. */
const joined = (sent: readonly Sent[], hash: string): Uint8Array => {
  const parts = ofKind(sent, 'asset-chunk').filter((chunk) => chunk.hash === hash).map((chunk) => Uint8Array.from(atob(chunk.data), (char) => char.charCodeAt(0)));
  const bytes = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  parts.reduce((offset, part) => (bytes.set(part, offset), offset + part.length), 0);
  return bytes;
};

async function videoTable(background = 'maps/falls.webm'): Promise<ShareHarness> {
  const table = shareHarness(sceneState({ background }), new Map([['maps/falls.webm', POSTER], ['maps/still.webp', IMAGE]]));
  table.videos.set('maps/falls.webm', VIDEO);
  table.share.start();
  await table.settle();
  return table;
}

describe("an animated map's video", () => {
  it('goes beside its poster, which stays the map', async () => {
    const table = await videoTable();
    expect(scenes(table.sent)).toEqual([{
      id: '000000000000000000000001', lit: false,
      map: { hash: await sha256Hex(POSTER), size: POSTER.length, mime: 'image/png' },
      video: { hash: await sha256Hex(VIDEO), size: VIDEO.length, mime: 'video/webm' },
    }]);
  });

  it('is served by hash in chunks, whole whatever side is asked for, and not again at once', async () => {
    const table = await videoTable();
    const hash = await sha256Hex(VIDEO);
    table.share.receive('alice', { t: 'asset-request', hash, maxSide: 1024 });
    await table.settle();
    expect(ofKind(table.sent, 'asset-variant')).toEqual([]);
    expect(ofKind(table.sent, 'asset-chunk').map((chunk) => [chunk.index, chunk.count])).toEqual([[0, 2], [1, 2]]);
    expect(joined(table.sent, hash)).toEqual(VIDEO);
    const sent = table.sent.length;
    table.share.receive('alice', { t: 'asset-request', hash });
    await table.settle();
    expect(table.sent.length).toBe(sent);
    await table.advance(REPEAT_REQUEST_MS);
    table.share.receive('alice', { t: 'asset-request', hash, from: 1 });
    await table.settle();
    expect(ofKind(table.sent.slice(sent), 'asset-chunk').map((chunk) => chunk.index)).toEqual([1]);
  });

  it('is refused once the map is another, or once its file holds another video', async () => {
    const table = await videoTable();
    const hash = await sha256Hex(VIDEO);
    table.videos.set('maps/falls.webm', VIDEO.map((value) => 255 - value));
    table.share.receive('alice', { t: 'asset-request', hash });
    await table.settle();
    expect(ofKind(table.sent, 'asset-refused')).toEqual([{ t: 'asset-refused', hash }]);

    table.videos.set('maps/falls.webm', VIDEO);
    await table.set(sceneState({ background: 'maps/still.webp' }));
    expect(scenes(table.sent).at(-1)).not.toHaveProperty('video');
    table.share.receive('bob', { t: 'asset-request', hash });
    await table.settle();
    expect(ofKind(table.sent, 'asset-refused').at(-1)).toEqual({ t: 'asset-refused', hash });
    expect(ofKind(table.sent, 'asset-chunk')).toEqual([]);
  });

  it('leaves players the poster where it cannot be sent', async () => {
    const table = shareHarness(sceneState({ background: 'maps/falls.webm' }), new Map([['maps/falls.webm', POSTER]]));
    table.share.start();
    await table.settle();
    expect(scenes(table.sent)).toEqual([{ id: '000000000000000000000001', lit: false, map: { hash: await sha256Hex(POSTER), size: POSTER.length, mime: 'image/png' } }]);
  });

  it('is read from the vault only for a video map no larger than an asset may be', async () => {
    let reads = 0;
    const app = (size: number): App => ({
      vault: {
        getFileByPath: (path: string) => (path === 'maps/falls.mp4' || path === 'maps/still.webp' ? { path, stat: { size } } : null),
        readBinary: () => ((reads += 1), Promise.resolve(new Uint8Array([1, 2, 3]).buffer)),
      },
    }) as unknown as App;
    expect(await readVaultVideo(app(3), 'maps/falls.mp4')).toEqual({ bytes: new Uint8Array([1, 2, 3]), mime: 'video/mp4' });
    expect(await readVaultVideo(app(MAX_ASSET_BYTES + 1), 'maps/falls.mp4')).toBeNull();
    expect(await readVaultVideo(app(3), 'maps/still.webp')).toBeNull();
    expect(await readVaultVideo(app(3), 'maps/gone.webm')).toBeNull();
    expect(reads).toBe(1);
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
