import { MARKS_INTERVAL_MS } from '../../../../src/app/online/protocol/index.ts';
import { describe, expect, it } from 'vitest';
import { sha256Hex } from '../../../../src/app/online/gm/assetServe.ts';
import { imageMimeType, LIGHTING_REFUSAL } from '../../../../src/app/online/gm/SceneShare.ts';
import { fakeStoring, storedRef } from './fakeStoring.ts';
import { GENERIC_SOURCE } from './gmLighting.ts';
import { scenes, sceneState as state, shareHarness, type ShareHarness } from './shareHarness.ts';

const MAP = new Uint8Array(4000).map((_, index) => index % 251);

const harness = (initial = state()): ShareHarness => shareHarness(initial, new Map([['maps/cave.webp', MAP]]));

describe('the shared scene', () => {
  it('goes to all players with the map named by its hash, size, type and the id the store keeps it under', async () => {
    const table = harness();
    table.share.start();
    await table.set(state());
    expect(scenes(table.sent)).toEqual([{ id: '000000000000000000000001', map: await storedRef(MAP, 'image/webp'), lit: false }]);
    expect(table.sent[0]?.to).toBeUndefined();
  });

  it('shows players without a token the map of the presented level, whichever level the GM looks at', async () => {
    const UPPER = MAP.map((value) => (value + 1) % 251);
    const levels = [
      { id: 'ground', name: 'Ground', elevation: { bottom: 0, top: 10 }, background: 'maps/cave.webp' },
      { id: 'upper', name: 'Upper', elevation: { bottom: 10, top: 20 }, background: 'maps/upper.webp' },
    ];
    const table = shareHarness(state({ levels, viewedLevel: 'upper' }), new Map([['maps/cave.webp', MAP], ['maps/upper.webp', UPPER]]));
    table.presented = 'upper';
    table.share.start();
    await table.set(state({ levels, viewedLevel: 'upper' }));
    expect(scenes(table.sent).at(-1)).toMatchObject({ map: { hash: await sha256Hex(UPPER) }, floor: { level: 1 } });

    const sent = table.sent.length;
    await table.set(state({ levels, viewedLevel: 'ground' }));
    expect(scenes(table.sent.slice(sent))).toEqual([]);
    table.presented = 'ground';
    await table.advance(1000);
    expect(scenes(table.sent).at(-1)).toMatchObject({ map: { hash: await sha256Hex(MAP) }, floor: { level: 0 } });
  });

  it('is held while a scene loads and goes out once it has loaded', async () => {
    const table = harness(state({ isMapLoading: true, mapLoaded: false }));
    table.share.start();
    await table.set(state({ isMapLoading: true, mapLoaded: false, background: 'maps/other.webp' }));
    expect(table.sent).toEqual([]);
    await table.set(state());
    expect(scenes(table.sent)).toHaveLength(1);
  });

  it('is lit while its lighting is on, and withdrawn with a notice while the GM\'s lighting cannot be read', async () => {
    const table = harness();
    table.share.start();
    const lit = state({ lighting: { enabled: true, ambient: 0 } });
    await table.set(lit);
    await table.set(state({ lighting: { enabled: false, ambient: 0.5 } }));
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

  it('goes without its map where the store does not keep it', async () => {
    const table = shareHarness(state(), new Map([['maps/cave.webp', MAP]]), undefined, undefined, fakeStoring(() => true));
    table.share.start();
    await table.set(state());
    expect(scenes(table.sent)).toEqual([{ id: '000000000000000000000001', map: null, lit: false }]);
    expect(table.notices).toEqual([]);
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
