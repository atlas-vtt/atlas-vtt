import { EXPLORED_INLINE_BYTES, parseGmMessage, type GmMessage } from '../../../../src/app/online/protocol/index.ts';
import { describe, expect, it } from 'vitest';
import { EXPLORED_INTERVAL_MS } from '../../../../src/app/online/gm/InputShare.ts';
import { sha256Hex, toBase64 } from '../../../../src/app/online/gm/assetServe.ts';
import { assetIdOf } from '../../../../src/app/online/gm/assets/assetIds.ts';
import { bytesOf, publisherHarness, SALT } from './fakeAssetStore.ts';
import { fakeStoring } from './fakeStoring.ts';
import { sceneState, shareHarness } from './shareHarness.ts';

type Explored = Extract<GmMessage, { t: 'explored' }>;

/** A lit scene whose saved explored memory is the PNG `mask`. */
const litWith = (mask: Uint8Array<ArrayBuffer>): ReturnType<typeof sceneState> => sceneState({ lighting: { enabled: true, ambient: 0.2 }, exploredMask: `data:image/png;base64,${toBase64(mask)}` });

/** A lit scene whose explored memory is `mask`, shared with a store; the explored messages players got. */
async function exploredSent(mask: Uint8Array<ArrayBuffer>): Promise<{ readonly sent: Explored[]; readonly store: ReturnType<typeof publisherHarness>; readonly table: ReturnType<typeof shareHarness> }> {
  const store = publisherHarness();
  const table = shareHarness(litWith(mask), new Map([['maps/cave.webp', bytesOf(300, 1)]]), undefined, undefined, store.publisher.storing);
  table.share.start();
  await table.settle();
  await table.advance(EXPLORED_INTERVAL_MS + 100);
  await store.idle();
  await table.settle();
  await store.advance(200);
  return { sent: table.sent.flatMap(({ body }) => (body.t === 'explored' ? [body] : [])), store, table };
}

describe('the explored memory', () => {
  it('goes inline as a PNG, and is never offered to the store', async () => {
    const mask = bytesOf(5000, 3);
    const { sent, store } = await exploredSent(mask);
    expect(sent.at(-1)).toEqual({ t: 'explored', scene: '000000000000000000000001', png: toBase64(mask), serial: 0 });
    // Players read it as the protocol has it.
    expect(parseGmMessage(JSON.parse(JSON.stringify(sent.at(-1))))).toEqual(sent.at(-1));
    expect(store.client.offers.flat().some((asset) => asset.size === mask.length)).toBe(false);
  });

  it('goes by the id the store keeps it under where it is larger than goes inline, offered as an image', async () => {
    const mask = bytesOf(EXPLORED_INLINE_BYTES + 1, 4);
    const { sent, store } = await exploredSent(mask);
    const hash = await sha256Hex(mask);
    const id = await assetIdOf(SALT, hash);
    expect(sent.at(-1)).toEqual({ t: 'explored', scene: '000000000000000000000001', mask: { hash, size: mask.length, mime: 'image/png', id }, serial: 0 });
    expect(parseGmMessage(JSON.parse(JSON.stringify(sent.at(-1))))).toEqual(sent.at(-1));
    expect(store.client.offers.flat()).toContainEqual({ id, kind: 'image', size: mask.length });
  });

  it('goes as neither where the store does not keep a large one', async () => {
    const mask = bytesOf(EXPLORED_INLINE_BYTES + 1, 4);
    const table = shareHarness(litWith(mask), new Map([['maps/cave.webp', bytesOf(300, 1)]]), undefined, undefined, fakeStoring(() => true));
    table.share.start();
    await table.advance(EXPLORED_INTERVAL_MS + 100);
    expect(table.sent.flatMap(({ body }) => (body.t === 'explored' ? [body] : []))).toEqual([{ t: 'explored', scene: '000000000000000000000001', serial: 0 }]);
  });

  it('is taken from players once the store no longer keeps a large one', async () => {
    const mask = bytesOf(EXPLORED_INLINE_BYTES + 1, 4);
    let refused = false;
    const table = shareHarness(litWith(mask), new Map([['maps/cave.webp', bytesOf(300, 1)]]), undefined, undefined, fakeStoring(() => refused));
    table.share.start();
    await table.advance(EXPLORED_INTERVAL_MS + 100);
    refused = true;
    table.share.refreshAssets();
    await table.advance(EXPLORED_INTERVAL_MS + 100);
    const sent = table.sent.flatMap(({ body }) => (body.t === 'explored' ? [body] : []));
    expect(sent.map((body) => body.mask?.hash ?? null)).toEqual([await sha256Hex(mask), null]);
  });

  it('drops a large memory a newer one replaced before it went up: neither offered nor uploaded', async () => {
    const [first, second] = [bytesOf(EXPLORED_INLINE_BYTES + 1, 5), bytesOf(EXPLORED_INLINE_BYTES + 2, 6)];
    const store = publisherHarness();
    const table = shareHarness(litWith(first), new Map([['maps/cave.webp', bytesOf(300, 1)]]), undefined, undefined, store.publisher.storing);
    table.share.start();
    await table.advance(EXPLORED_INTERVAL_MS + 100);
    await store.idle();
    await table.set(litWith(second));
    await table.advance(EXPLORED_INTERVAL_MS + 100);
    await store.idle();
    await store.advance(2000);
    const [firstId, secondId] = await Promise.all([first, second].map(async (bytes) => assetIdOf(SALT, await sha256Hex(bytes))));
    const masks = table.sent.flatMap(({ body }) => (body.t === 'explored' && body.mask !== undefined ? [body.mask.id] : []));
    expect(masks).toEqual([firstId, secondId]);
    expect(store.client.offers.flat().map((asset) => asset.id)).not.toContain(firstId);
    expect(store.client.offers.flat().map((asset) => asset.id)).toContain(secondId);
    expect(store.client.calls.map((call) => call.id)).not.toContain(firstId);
  });
});
