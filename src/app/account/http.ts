/** A request to Atlas's servers: never a token in the URL, only in `authorization`. */
export interface HttpRequest {
  readonly url: string;
  readonly method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  readonly authorization?: string;
  /** Further headers, such as a part's checksum; never `Authorization`, which only `authorization` sets. */
  readonly headers?: Readonly<Record<string, string>>;
  /** A form body (`application/x-www-form-urlencoded`), as RFC 8628 has apps send. */
  readonly form?: Readonly<Record<string, string>>;
  /** A JSON body (`application/json`). */
  readonly json?: Readonly<Record<string, unknown>>;
  /** A binary body (`application/octet-stream`), such as a part of an upload. */
  readonly bytes?: ArrayBuffer;
}

export interface HttpResponse {
  readonly status: number;
  /** The body as JSON, or null when it is none. */
  readonly json: unknown;
}

/** How Atlas reaches a server; throws only when the server cannot be reached at all. */
export type Http = (request: HttpRequest) => Promise<HttpResponse>;

/** The request's body and its type. */
export function bodyOf(request: HttpRequest): { readonly body?: string | ArrayBuffer; readonly contentType?: string } {
  if (request.form !== undefined) return { body: new URLSearchParams(request.form).toString(), contentType: 'application/x-www-form-urlencoded' };
  if (request.json !== undefined) return { body: JSON.stringify(request.json), contentType: 'application/json' };
  if (request.bytes !== undefined) return { body: request.bytes, contentType: 'application/octet-stream' };
  return {};
}

/** A field of a JSON object, or undefined. */
export function field(json: unknown, name: string): unknown {
  return typeof json === 'object' && json !== null && !Array.isArray(json) ? (json as Record<string, unknown>)[name] : undefined;
}
