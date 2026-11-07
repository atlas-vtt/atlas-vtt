/** A request to the account service or the relay: never a token in the URL, only in `authorization`. */
export interface HttpRequest {
  readonly url: string;
  readonly method: 'GET' | 'POST';
  readonly authorization?: string;
  /** A form body (`application/x-www-form-urlencoded`), as RFC 8628 has apps send. */
  readonly form?: Readonly<Record<string, string>>;
  /** A JSON body (`application/json`). */
  readonly json?: Readonly<Record<string, unknown>>;
}

export interface HttpResponse {
  readonly status: number;
  /** The body as JSON, or null when it is none. */
  readonly json: unknown;
}

/** How the companion reaches a server; throws only when the server cannot be reached at all. */
export type Http = (request: HttpRequest) => Promise<HttpResponse>;

/** The request's body and its type. */
export function bodyOf(request: HttpRequest): { readonly body?: string; readonly contentType?: string } {
  if (request.form !== undefined) return { body: new URLSearchParams(request.form).toString(), contentType: 'application/x-www-form-urlencoded' };
  if (request.json !== undefined) return { body: JSON.stringify(request.json), contentType: 'application/json' };
  return {};
}

/** A field of a JSON object, or undefined. */
export function field(json: unknown, name: string): unknown {
  return typeof json === 'object' && json !== null && !Array.isArray(json) ? (json as Record<string, unknown>)[name] : undefined;
}
