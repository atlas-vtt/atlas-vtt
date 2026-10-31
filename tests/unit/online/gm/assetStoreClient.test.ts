import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RequestUrlParam } from 'obsidian';
import { AssetStoreClient } from '../../../../src/app/online/gm/assets/storeClient.ts';
import { partSizes } from '../../../../src/app/online/gm/assets/assetRoutes.ts';
import { RELAY_ORIGIN } from '../../../../src/app/online/gm/servers.ts';

const seen = vi.hoisted(() => ({ requests: [] as RequestUrlParam[], answer: { status: 200, json: null as unknown } as { status: number; json: unknown } | Error, queue: [] as { status: number; json: unknown }[] }));

vi.mock('obsidian', () => ({
  requestUrl: (request: RequestUrlParam) => {
    seen.requests.push(request);
    const queued = seen.queue.shift();
    if (queued !== undefined) return Promise.resolve(queued);
    return seen.answer instanceof Error ? Promise.reject(seen.answer) : Promise.resolve(seen.answer);
  },
}));

const ID = 'a'.repeat(64);
const SHA = 'b'.repeat(64);

describe('the asset store\'s client', () => {
  beforeEach(() => {
    seen.requests.length = 0;
    seen.answer = { status: 200, json: null };
  });

  it('offers on the relay\'s origin with the account\'s token in the header, and reads the answers', async () => {
    seen.answer = { status: 200, json: { assets: { [ID]: { answer: 'need', upload: 'single', partBytes: 99 }, [SHA]: { answer: 'refused', reason: 'quota', free: 0 }, bad: { answer: 'have' } }, bytes: 1, quota: 2 } };
    const client = new AssetStoreClient(RELAY_ORIGIN, () => 'tok');
    const result = await client.offer([{ id: ID, kind: 'image', size: 10 }]);
    expect(client.lastEvicted).toBeNull();
    expect(seen.requests[0]).toMatchObject({ url: `${RELAY_ORIGIN}/api/assets/offer`, method: 'POST', headers: { Authorization: 'Bearer tok' }, contentType: 'application/json', throw: false });
    expect(JSON.parse(seen.requests[0]?.body as string)).toEqual({ assets: [{ id: ID, kind: 'image', size: 10 }] });
    expect(result).toEqual({ ok: true, value: new Map([[ID, { answer: 'need', upload: 'single', partBytes: 99 }], [SHA, { answer: 'refused', reason: 'quota' }]]) });
  });

  it('reads what the store let go to make room, leniently, and keeps it only for diagnostics', async () => {
    const client = new AssetStoreClient(RELAY_ORIGIN, () => 'tok');
    seen.answer = { status: 200, json: { assets: {}, evicted: { count: 3, bytes: 4096 } } };
    await client.offer([]);
    expect(client.lastEvicted).toEqual({ count: 3, bytes: 4096 });
    seen.answer = { status: 200, json: { assets: {}, evicted: { count: 'many' } } };
    expect(await client.offer([])).toEqual({ ok: true, value: new Map() });
    expect(client.lastEvicted).toBeNull();
  });

  it('sends a whole object as its bytes, with its type and hash, and takes a 412 as stored', async () => {
    const bytes = Uint8Array.from([1, 2, 3]).buffer;
    seen.answer = { status: 412, json: null };
    const result = await new AssetStoreClient(RELAY_ORIGIN, () => 'tok').putWhole(ID, bytes, 'image/png', SHA);
    expect(result).toEqual({ ok: true, value: null });
    expect(seen.requests[0]).toMatchObject({ url: `${RELAY_ORIGIN}/api/assets/${ID}`, method: 'PUT', contentType: 'image/png', headers: { 'X-Asset-SHA256': SHA, Authorization: 'Bearer tok' } });
    expect(seen.requests[0]?.body).toBe(bytes);
  });

  it('starts or resumes a multipart upload and reads which parts arrived', async () => {
    seen.answer = { status: 200, json: { uploadId: 'u1', arrived: [1, 3, 'x'] } };
    const client = new AssetStoreClient(RELAY_ORIGIN, () => 'tok');
    const session = await client.startParts(ID, 20, 'video/webm', [{ sha256: SHA, size: 20 }]);
    expect(JSON.parse(seen.requests[0]?.body as string)).toEqual({ size: 20, type: 'video/webm', parts: [{ sha256: SHA, size: 20 }] });
    expect(session).toEqual({ ok: true, value: { uploadId: 'u1', arrived: new Set([1, 3]) } });
    seen.answer = { status: 200, json: {} };
    await client.putPart(ID, 2, new ArrayBuffer(4), SHA);
    await client.complete(ID, SHA);
    expect(seen.requests[2]?.headers).toMatchObject({ 'X-Asset-SHA256': SHA });
    expect(seen.requests.map((request) => `${request.method} ${request.url.replace(RELAY_ORIGIN, '')}`)).toEqual([`POST /api/assets/${ID}/parts`, `PUT /api/assets/${ID}/parts/2`, `POST /api/assets/${ID}/complete`]);
    expect(partSizes(40 * 1024 * 1024)).toEqual([16 * 1024 * 1024, 16 * 1024 * 1024, 8 * 1024 * 1024]);
  });

  it('names what went wrong: signed out, forbidden, missing, refused or worth another try', async () => {
    const client = new AssetStoreClient(RELAY_ORIGIN, () => 'tok');
    const trouble = async (status: number): Promise<unknown> => {
      seen.answer = { status, json: null };
      const result = await client.salt();
      return result.ok ? null : result.trouble;
    };
    expect(await trouble(401)).toBe('signed-out');
    expect(await trouble(403)).toBe('forbidden');
    expect(await trouble(404)).toBe('missing');
    expect(await trouble(422)).toBe('rejected');
    expect(await trouble(503)).toBe('retry');
    expect(await trouble(409)).toBe('retry');
    seen.answer = new Error('offline');
    expect(await client.offer([])).toEqual({ ok: false, trouble: 'retry' });
  });

  it('asks nothing while signed out', async () => {
    expect(await new AssetStoreClient(RELAY_ORIGIN, () => null).offer([])).toEqual({ ok: false, trouble: 'signed-out' });
    expect(seen.requests).toEqual([]);
  });

  it('reads the salt', async () => {
    const client = new AssetStoreClient(RELAY_ORIGIN, () => 'tok');
    seen.answer = { status: 200, json: { salt: 'c2FsdA==' } };
    expect(await client.salt()).toEqual({ ok: true, value: 'c2FsdA==' });
    expect(seen.requests.map((request) => `${request.method} ${request.url.replace(RELAY_ORIGIN, '')}`)).toEqual(['GET /api/assets/salt']);
    expect(seen.requests.every((request) => !request.url.includes('tok'))).toBe(true);
  });

});
