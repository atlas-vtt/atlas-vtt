import { describe, expect, it, vi } from 'vitest';
import type { HttpRequest, HttpResponse } from '../../../src/app/account/http';
import { ArmariumApi, ArmariumError } from '../../../src/app/armarium/upload/armariumApi';
import { DECLARATION } from '../../../src/app/armarium/upload/uploadContract';

const API = 'https://api.atlas-vtt.dev/v1/armarium';
const SUBMISSION = { id: 'sub-1', state: 'checked', bytes: 1200, parts: [], expiresAt: '2026-10-22T12:00:00.000Z', progress: null, findings: [{ code: 'note-unsafe-link', level: 'warning', path: 'Lore/Cave.md', detail: '12: http:' }], manifest: { uid: 'col', version: 1, name: 'Caves', format: 8, notes: null, counts: {}, coverKey: null }, holdReasons: [], statement: null, listing: null };

function api(answers: (request: HttpRequest) => HttpResponse | Error, token: string | null = 'tok'): { client: ArmariumApi; requests: HttpRequest[]; signedOut: ReturnType<typeof vi.fn> } {
  const requests: HttpRequest[] = [];
  const signedOut = vi.fn();
  const client = new ArmariumApi({
    http: (request) => {
      requests.push(request);
      const answer = answers(request);
      return answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer);
    },
    token: () => token,
    signedOut,
  });
  return { client, requests, signedOut };
}

describe('the Armarium API from Atlas', () => {
  it('sends the token as a bearer, only to the Armarium on api.atlas-vtt.dev, and never in a URL', async () => {
    const { client, requests } = api(() => ({ status: 200, json: SUBMISSION }));
    await client.eligibility().catch(() => undefined);
    await client.submission('sub-1');
    await client.putPart('sub-1', 2, new ArrayBuffer(3), 'abc');
    await client.publish('sub-1');
    expect(requests.every((request) => request.url.startsWith(`${API}/`) && request.authorization === 'Bearer tok' && !request.url.includes('tok'))).toBe(true);
    expect(requests[2]).toMatchObject({ method: 'PUT', url: `${API}/uploads/sub-1/parts/2`, headers: { 'x-atlas-part-sha256': 'abc' } });
    expect(requests[2]?.bytes?.byteLength).toBe(3);
    expect(requests[3]).toMatchObject({ method: 'POST', url: `${API}/uploads/sub-1/publish`, json: { declaration: true, declarationVersion: DECLARATION.version } });
  });

  it('reads eligibility, tickets and submissions, and refuses a shape it does not know', async () => {
    const { client } = api((request) => {
      if (request.url.endsWith('/eligibility')) return { status: 200, json: { may: false, reason: 'needs-linked-provider', until: null, remaining: {}, storedBytes: 0, quotaBytes: 1 } };
      if (request.method === 'POST') return { status: 200, json: { id: 'sub-1', partBytes: 16777216, parts: 1, expiresAt: '2030-01-01T00:00:00Z' } };
      return { status: 200, json: { id: 'sub-1', state: 'no-such-state' } };
    });
    expect(await client.eligibility()).toEqual({ may: false, reason: 'needs-linked-provider', until: null });
    expect(await client.ticket('a.zip', 10)).toEqual({ id: 'sub-1', partBytes: 16777216, parts: 1, expiresAt: '2030-01-01T00:00:00Z' });
    await expect(client.submission('sub-1')).rejects.toThrow(/shape/);
  });

  it('reads a submission with its findings and the bundle\'s manifest', async () => {
    const { client } = api(() => ({ status: 200, json: SUBMISSION }));
    expect(await client.submission('sub-1')).toEqual({
      id: 'sub-1', state: 'checked', bytes: 1200, parts: [], progress: null,
      findings: [{ code: 'note-unsafe-link', level: 'warning', path: 'Lore/Cave.md', detail: '12: http:' }],
      manifest: { uid: 'col', version: 1, name: 'Caves', notes: null }, listing: null,
    });
  });

  it('turns a refusal into its code, with its date and the fields a bad-fields answer names', async () => {
    const { client } = api((request) => (request.url.endsWith('/listing')
      ? { status: 400, json: { code: 'bad-fields', problems: { description: 'too-short', tags: 'exclusive' } } }
      : { status: 429, json: { code: 'too-many-today', until: '2026-11-19T10:00:00.000Z' } }));
    await expect(client.ticket('a.zip', 10)).rejects.toMatchObject({ status: 429, code: 'too-many-today', until: '2026-11-19T10:00:00.000Z' });
    await expect(client.putListing('sub-1', { kind: 'maps', system: null, description: 'x', tags: [], licence: 'cc0', credits: '' }))
      .rejects.toMatchObject({ code: 'bad-fields', problems: { description: 'too-short', tags: 'exclusive' } });
  });

  it('says `network` when no answer came, and asks nothing while signed out', async () => {
    const offline = api(() => new Error('offline'));
    await expect(offline.client.eligibility()).rejects.toMatchObject({ code: 'network', status: 0 });
    const signedOut = api(() => ({ status: 200, json: {} }), null);
    await expect(signedOut.client.eligibility()).rejects.toBeInstanceOf(ArmariumError);
    expect(signedOut.requests).toEqual([]);
  });

  it('forgets the token on a 401 from a route of the share, but never for the optional read of one\'s own listings', async () => {
    const refused = api(() => ({ status: 401, json: { code: 'signed-out' } }));
    await expect(refused.client.eligibility()).rejects.toMatchObject({ code: 'signed-out' });
    expect(refused.signedOut).toHaveBeenCalledTimes(1);
    expect(await refused.client.ownListing('col')).toBeNull();
    expect(refused.signedOut).toHaveBeenCalledTimes(1);
  });

  it('finds the account\'s listing of a collection with its newest version and fields', async () => {
    const { client } = api(() => ({
      status: 200,
      json: {
        listings: [
          { uid: 'other', slug: 'other', versions: [] },
          { uid: 'col', slug: 'blue-mouth-caves', fields: { kind: 'adventure', system: 'cairn', description: 'Six caves under the Blue Mouth.', tags: ['underground', 'from-the-future'], licence: 'cc-by-4.0', credits: '' }, versions: [{ version: 2 }, { version: 4 }] },
        ],
        submissions: [],
        index: { sequence: 1, writtenAt: null },
      },
    }));
    expect(await client.ownListing('col')).toEqual({
      uid: 'col', slug: 'blue-mouth-caves', newestVersion: 4,
      fields: { kind: 'adventure', system: 'cairn', description: 'Six caves under the Blue Mouth.', tags: ['underground'], licence: 'cc-by-4.0', credits: '' },
    });
    expect(await client.ownListing('missing')).toBeNull();
  });
});
