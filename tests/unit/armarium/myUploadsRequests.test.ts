import { describe, expect, it, vi } from 'vitest';
import type { HttpRequest, HttpResponse } from '../../../src/app/account/http';
import { readFrameMessage } from '../../../src/app/armarium/armariumMessages';
import { ArmariumApi } from '../../../src/app/armarium/upload/armariumApi';

const UID = 'da0b742f-d1fc-4f2a-9b0f-300d7e45538e';
const SUBMISSION = '0b7e5a52-6c1f-4f7e-9f61-2b8d3c1a9e40';
const api = (method: string, path: string, body?: unknown): unknown => ({ type: 'atlas-armarium:api', format: 1, id: 'r1', method, path, ...(body === undefined ? {} : { body }) });

describe("My uploads' requests from the Armarium page in Atlas' frame", () => {
  it('reads the four requests of My uploads, each below the Armarium API', () => {
    expect(readFrameMessage(api('GET', '/v1/armarium/mine'))).toEqual({ type: 'atlas-armarium:api', id: 'r1', request: { method: 'GET', path: '/mine' } });
    expect(readFrameMessage(api('PATCH', `/v1/armarium/listings/${UID}`, { description: 'More caves.' }))).toEqual({
      type: 'atlas-armarium:api', id: 'r1', request: { method: 'PATCH', path: `/listings/${UID}`, body: { description: 'More caves.' } },
    });
    expect(readFrameMessage(api('POST', `/v1/armarium/listings/${UID}/unpublish`, { anything: 1 }))).toEqual({
      type: 'atlas-armarium:api', id: 'r1', request: { method: 'POST', path: `/listings/${UID}/unpublish`, body: {} },
    });
    expect(readFrameMessage(api('DELETE', `/v1/armarium/uploads/${SUBMISSION}`))).toEqual({
      type: 'atlas-armarium:api', id: 'r1', request: { method: 'DELETE', path: `/uploads/${SUBMISSION}`, body: {} },
    });
    expect(readFrameMessage({ type: 'atlas-armarium:sign-in', format: 1 })).toEqual({ type: 'atlas-armarium:sign-in' });
  });

  it.each([
    ['publishing', 'POST', `/v1/armarium/uploads/${SUBMISSION}/publish`],
    ['an upload', 'POST', '/v1/armarium/uploads'],
    ['the desk', 'GET', '/v1/armarium/staff/overview'],
    ['a review', 'PUT', `/v1/armarium/listings/${UID}/review`],
    ['My uploads written to', 'POST', '/v1/armarium/mine'],
    ['a listing read', 'GET', `/v1/armarium/listings/${UID}`],
    ['the account service', 'GET', '/v1/accounts/me'],
    ['a path that climbs', 'GET', '/v1/armarium/mine/../staff'],
    ['a listing uid with a path in it', 'PATCH', '/v1/armarium/listings/..%2Fstaff'],
    ['a submission that is no id', 'DELETE', '/v1/armarium/uploads/eligibility'],
    ['a query', 'GET', '/v1/armarium/mine?all=1'],
    ['another origin', 'GET', 'https://evil.example/v1/armarium/mine'],
  ])('sends nothing else: %s', (_name, method, path) => {
    expect(readFrameMessage(api(method, path))).toBeNull();
  });

  it('refuses a request without a usable id, and an edit whose body is no record', () => {
    for (const id of ['', 'x'.repeat(65), 7]) expect(readFrameMessage({ ...(api('GET', '/v1/armarium/mine') as object), id })).toBeNull();
    expect(readFrameMessage(api('PATCH', `/v1/armarium/listings/${UID}`, ['description']))).toBeNull();
  });

  it("sends a request with the account's token and hands the page the API's answer as it came", async () => {
    const requests: HttpRequest[] = [];
    const signedOut = vi.fn();
    let token: string | null = 'tok';
    const answers: HttpResponse[] = [{ status: 200, json: { listings: [] } }, { status: 401, json: { code: 'signed-out' } }];
    const client = new ArmariumApi({ http: (request) => { requests.push(request); return Promise.resolve(answers.shift() ?? { status: 500, json: null }); }, token: () => token, signedOut });
    expect(await client.forward({ method: 'GET', path: '/mine' })).toEqual({ status: 200, body: { listings: [] } });
    expect(requests[0]).toMatchObject({ method: 'GET', url: 'https://api.atlas-vtt.dev/v1/armarium/mine', authorization: 'Bearer tok' });
    expect(await client.forward({ method: 'PATCH', path: `/listings/${UID}`, body: { description: 'x' } })).toEqual({ status: 401, body: { code: 'signed-out' } });
    expect(requests[1]).toMatchObject({ method: 'PATCH', json: { description: 'x' } });
    expect(signedOut).toHaveBeenCalledTimes(1);
    token = null;
    expect(await client.forward({ method: 'GET', path: '/mine' })).toEqual({ status: 401, body: { code: 'signed-out' } });
    expect(requests).toHaveLength(2);
    const offline = new ArmariumApi({ http: () => Promise.reject(new Error('offline')), token: () => 'tok', signedOut });
    expect(await offline.forward({ method: 'GET', path: '/mine' })).toEqual({ status: 0, body: null });
  });
});
