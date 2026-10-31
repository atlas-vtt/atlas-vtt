import { requestUrl } from 'obsidian';
import { ASSET_ROUTES, offerAnswers, offerEvicted, partsSessionOf, tilesProgressOf, type OfferAnswer, type OfferedAsset, type OfferEviction, type PartsSession, type TilesProgress } from './assetRoutes.ts';

/** A request to the store: a path on the relay's origin, never a token in it. */
interface StoreRequest {
  readonly path: string;
  readonly method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  readonly json?: object;
  readonly body?: ArrayBuffer;
  readonly contentType?: string;
  readonly headers?: Readonly<Record<string, string>>;
}

/**
 * Why a call came back without what it asked for: the token is no longer signed in, the account may not
 * store now, the route or asset is not there (a relay without the store), the request was refused for
 * what it carried, or a failure worth trying again (not reached, busy, a server error).
 */
export type StoreTrouble = 'signed-out' | 'forbidden' | 'missing' | 'rejected' | 'retry';

export type StoreResult<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly trouble: StoreTrouble };

function troubleOf(status: number): StoreTrouble {
  if (status === 401) return 'signed-out';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'missing';
  // A 409: parts are still missing, which starting the upload again names.
  if (status === 0 || status === 408 || status === 409 || status === 429 || status >= 500) return 'retry';
  return 'rejected';
}

const failed = <T>(trouble: StoreTrouble): StoreResult<T> => ({ ok: false, trouble });

/**
 * The asset store's write side on the relay, through Obsidian's `requestUrl` (no CORS, binary bodies),
 * with the account's token in the `Authorization` header as `/api/tables` has it. Bytes go up as they
 * are: nothing is decoded or encoded. Never logs a token, an id or a hash.
 */
export class AssetStoreClient {
  /** What the store let go to make room for the last offer, kept for diagnostics only: nothing shows or logs it. */
  lastEvicted: OfferEviction | null = null;

  constructor(private readonly origin: string, private readonly token: () => string | null) {}

  async offer(assets: readonly OfferedAsset[]): Promise<StoreResult<Map<string, OfferAnswer>>> {
    const response = await this.call({ path: ASSET_ROUTES.offer, method: 'POST', json: { assets } });
    if (response.status !== 200) return failed(troubleOf(response.status));
    this.lastEvicted = offerEvicted(response.json);
    return { ok: true, value: offerAnswers(response.json) };
  }

  /** A whole object in one body; a 412 (the same bytes stored meanwhile) is success. */
  async putWhole(id: string, bytes: ArrayBuffer, mime: string, sha256: string): Promise<StoreResult<null>> {
    const response = await this.call({ path: ASSET_ROUTES.whole(id), method: 'PUT', body: bytes, contentType: mime, headers: { 'X-Asset-SHA256': sha256 } });
    return isStored(response.status) ? { ok: true, value: null } : failed(troubleOf(response.status));
  }

  /** Starts or resumes a multipart upload of an object of type `mime`: the store answers which parts arrived already. */
  async startParts(id: string, size: number, mime: string, parts: readonly { readonly sha256: string; readonly size: number }[]): Promise<StoreResult<PartsSession>> {
    const response = await this.call({ path: ASSET_ROUTES.parts(id), method: 'POST', json: { size, type: mime, parts } });
    const session = response.status === 200 ? partsSessionOf(response.json) : null;
    return session !== null ? { ok: true, value: session } : failed(response.status === 200 ? 'retry' : troubleOf(response.status));
  }

  async putPart(id: string, part: number, bytes: ArrayBuffer, sha256: string): Promise<StoreResult<null>> {
    const response = await this.call({ path: ASSET_ROUTES.part(id, part), method: 'PUT', body: bytes, contentType: 'application/octet-stream', headers: { 'X-Asset-SHA256': sha256 } });
    return isStored(response.status) ? { ok: true, value: null } : failed(troubleOf(response.status));
  }

  /** Completes a multipart upload; the store checks the whole object against `sha256`. */
  async complete(id: string, sha256: string): Promise<StoreResult<null>> {
    const response = await this.call({ path: ASSET_ROUTES.complete(id), method: 'POST', json: {}, headers: { 'X-Asset-SHA256': sha256 } });
    return isStored(response.status) ? { ok: true, value: null } : failed(troubleOf(response.status));
  }

  /** One batch of a pyramid's tiles as a `multipart/form-data` body (`multipartBody`); the first carries the manifest. */
  async putTiles(id: string, body: ArrayBuffer, contentType: string): Promise<StoreResult<TilesProgress>> {
    const response = await this.call({ path: ASSET_ROUTES.tiles(id), method: 'PUT', body, contentType });
    const progress = response.status === 200 ? tilesProgressOf(response.json) : null;
    return progress !== null ? { ok: true, value: progress } : failed(response.status === 200 ? 'retry' : troubleOf(response.status));
  }

  /** Takes an asset out of the store (a pyramid given up), releasing what was kept for it. */
  async remove(id: string): Promise<StoreResult<null>> {
    const response = await this.call({ path: ASSET_ROUTES.whole(id), method: 'DELETE' });
    return response.status === 200 || response.status === 204 || response.status === 404 ? { ok: true, value: null } : failed(troubleOf(response.status));
  }

  /** The account's salt, as base64 text; the caller reads it. */
  async salt(): Promise<StoreResult<unknown>> {
    const response = await this.call({ path: ASSET_ROUTES.salt, method: 'GET' });
    return response.status === 200 ? { ok: true, value: (response.json as { salt?: unknown } | null)?.salt } : failed(troubleOf(response.status));
  }

  private async call(request: StoreRequest): Promise<{ readonly status: number; readonly json: unknown }> {
    const token = this.token();
    if (token === null) return { status: 401, json: null };
    const body = request.body ?? (request.json === undefined ? undefined : JSON.stringify(request.json));
    const contentType = request.contentType ?? (request.json === undefined ? undefined : 'application/json');
    try {
      const response = await requestUrl({
        url: `${this.origin}${request.path}`,
        method: request.method,
        headers: { ...request.headers, Authorization: `Bearer ${token}` },
        ...(body === undefined ? {} : { body }),
        ...(contentType === undefined ? {} : { contentType }),
        throw: false,
      });
      return { status: response.status, json: jsonOf(response) };
    } catch {
      // Not reached at all: tried again later, and said nowhere (the URL holds an id).
      return { status: 0, json: null };
    }
  }
}

const isStored = (status: number): boolean => (status >= 200 && status < 300) || status === 412;

function jsonOf(response: { readonly json: unknown }): unknown {
  try {
    return response.json;
  } catch {
    return null;
  }
}
