// @vitest-environment node
import { ASSET_CHUNK_BYTES, MARKS_INTERVAL_MS } from '../../../../src/app/online/protocol/index.ts';
import { describe, expect, it } from 'vitest';
import { sha256Hex } from '../../../../src/app/online/gm/assetServe.ts';
import { imageMimeType, LIGHTING_REFUSAL, REPEAT_REQUEST_MS } from '../../../../src/app/online/gm/SceneShare.ts';
import { GENERIC_SOURCE } from './gmLighting.ts';
import { scenes, sceneState as state, shareHarness, type ShareHarness } from './shareHarness.ts';

const MAP = new Uint8Array(ASSET_CHUNK_BYTES * 2 + 5).map((_, index) => index % 251);

const harness = (initial = state()): ShareHarness => shareHarness(initial, new Map([['maps/cave.webp', MAP]]));

describe('the shared scene', () => {
  it('goes to all players with the map named by its hash, size and type', async () => {
    const table = harness();
    table.share.start();
    await table.set(state());
    expect(scenes(table.sent)).toEqual([{ id: '000000000000000000000001', map: { hash: await sha256Hex(MAP), size: MAP.length, mime: 'image/webp' }, lit: false }]);
    expect(table.sent[0]?.to).toBeUndefined();
  });

  it('is held while a scene loads and goes out once it has loaded', async () => {
    const table = harness(state({ isMapLoading: true, mapLoaded: false }));
    table.share.start();
    await table.set(state({ isMapLoading: true, mapLoaded: false, background: 'maps/other.webp' }));
    expect(table.sent).toEqual([]);
    await table.set(state());
    expect(scenes(table.sent)).toHaveLength(1);
  });

  it('is lit while its lighting and Atlas\'s dynamic lighting are on, and withdrawn with a notice while the GM\'s lighting cannot be read', async () => {
    const table = harness();
    table.share.start();
    const lit = state({ lighting: { enabled: true, ambient: 0 } });
    await table.set(lit);
    table.settings = { dynamicLighting: false, showNames: true, showDiceRolls: false, showInitiative: true, showWidgets: true, showCursors: false };
    await table.set(state({ lighting: { enabled: true, ambient: 0.5 } }));
    table.settings = { dynamicLighting: null, showNames: true, showDiceRolls: false, showInitiative: true, showWidgets: true, showCursors: false };
    table.lighting = null;
    await table.set(lit);
    table.lighting = GENERIC_SOURCE;
    await table.set(state({ lighting: { enabled: true, ambient: 0.2 } }));
    const sent = scenes(table.sent) as ({ lit: boolean } | null)[];
    expect(sent.map((scene) => scene?.lit ?? null)).toEqual([true, false, null, true]);
    expect(table.notices).toEqual([LIGHTING_REFUSAL]);
  });

  it('goes again to a player who joins, and a resend of the same scene keeps its id', async () => {
    const table = harness();
    table.share.start();
    await table.set(state());
    table.share.resend('alice');
    const [first, again] = table.sent.filter(({ body }) => body.t === 'scene');
    expect(again?.to).toBe('alice');
    expect(again?.body).toEqual(first?.body);
  });

  it('takes the marks of the scene before along with it: none of them follow the next scene', async () => {
    const table = shareHarness(state(), new Map([['maps/cave.webp', MAP], ['maps/other.webp', MAP.slice(1)]]));
    table.share.start();
    await table.set(state());
    const [first] = scenes(table.sent) as { id: string }[];
    table.share.receive('a'.repeat(20), { t: 'measure', scene: first?.id, color: '#66ffa9', live: { shape: 'line', a: [10, 10], b: [80, 10] }, kept: [] });
    await table.advance(MARKS_INTERVAL_MS);
    expect(table.sent.some(({ body }) => body.t === 'marks' && body.scene === first?.id)).toBe(true);
    await table.set(state({ background: 'maps/other.webp' }));
    const switched = table.sent.findIndex(({ body }) => body.t === 'scene' && body.scene?.id !== first?.id);
    expect(switched).toBeGreaterThan(0);
    expect(table.sent.slice(switched).filter(({ body }) => body.t === 'marks' && body.scene === first?.id)).toEqual([]);
  });

  it('withdraws an image players cannot be sent, such as an SVG', async () => {
    const table = harness(state({ background: 'maps/cave.svg' }));
    table.share.start();
    await table.set(state({ background: 'maps/cave.svg' }));
    expect(scenes(table.sent)).toEqual([null]);
    expect(imageMimeType('maps/cave.svg')).toBeNull();
    expect(imageMimeType('maps/Cave.JPG')).toBe('image/jpeg');
  });
});

describe('assets', () => {
  it('go only to the player who asked, in chunks, only for the map of the current picture', async () => {
    const table = harness();
    table.share.start();
    await table.set(state());
    const hash = await sha256Hex(MAP);
    table.sent.length = 0;
    table.share.receive('alice', { t: 'asset-request', hash });
    table.share.receive('bob', { t: 'asset-request', hash: 'f'.repeat(64) });
    const chunks = table.sent.filter(({ body }) => body.t === 'asset-chunk');
    expect(chunks.map(({ to }) => to)).toEqual(['alice', 'alice', 'alice']);
    expect(chunks.every(({ body }) => body.t === 'asset-chunk' && body.data.length <= (ASSET_CHUNK_BYTES / 3) * 4)).toBe(true);
    expect(table.sent.filter(({ body }) => body.t === 'asset-refused')).toEqual([{ body: { t: 'asset-refused', hash: 'f'.repeat(64) }, to: 'bob' }]);
  });

  it('are refused once the scene is withdrawn, and a repeated request is ignored for a while', async () => {
    const table = harness();
    table.share.start();
    await table.set(state());
    const hash = await sha256Hex(MAP);
    table.share.receive('alice', { t: 'asset-request', hash });
    const count = table.sent.length;
    table.share.receive('alice', { t: 'asset-request', hash });
    expect(table.sent.length).toBe(count);
    await table.advance(REPEAT_REQUEST_MS);
    table.share.receive('alice', { t: 'asset-request', hash });
    expect(table.sent.length).toBe(count + 3);
    table.lighting = null;
    await table.set(state({ lighting: { enabled: true, ambient: 1 } }));
    table.sent.length = 0;
    table.share.receive('alice', { t: 'asset-request', hash });
    expect(table.sent).toEqual([{ body: { t: 'asset-refused', hash }, to: 'alice' }]);
  });

  it('continue a download from the chunk asked for, and a player who left may ask again at once', async () => {
    const table = harness();
    table.share.start();
    await table.set(state());
    const hash = await sha256Hex(MAP);
    table.sent.length = 0;
    table.share.receive('alice', { t: 'asset-request', hash });
    const whole = table.sent.map(({ body }) => (body.t === 'asset-chunk' ? body.index : -1));
    expect(whole).toEqual([0, 1, 2]);
    table.sent.length = 0;
    table.share.receive('alice', { t: 'asset-request', hash, from: 2 });
    expect(table.sent.map(({ body, to }) => [body.t === 'asset-chunk' ? body.index : -1, to])).toEqual([[2, 'alice']]);
    table.sent.length = 0;
    table.share.receive('alice', { t: 'asset-request', hash, from: 2 });
    expect(table.sent).toEqual([]);
    table.share.playerLeft('alice');
    table.share.receive('alice', { t: 'asset-request', hash, from: 2 });
    expect(table.sent.map(({ body }) => (body.t === 'asset-chunk' ? body.index : -1))).toEqual([2]);
  });

  it('ignore malformed requests', async () => {
    const table = harness();
    table.share.start();
    await table.set(state());
    table.sent.length = 0;
    table.share.receive('alice', { t: 'asset-request', hash: '../../secret' });
    table.share.receive('alice', 'nonsense');
    expect(table.sent).toEqual([]);
  });
});
