import { requestUrl } from 'obsidian';
import { bodyOf, field, type Http, type HttpRequest } from './http.ts';

/**
 * Says in the console why a request got no usable answer, so a GM can send it to us: the dialogs only
 * show "Can't reach". URLs never hold a token (`HttpRequest`), and the error text names none.
 */
function logTrouble(request: HttpRequest, trouble: string): void {
  console.warn(`[Atlas] ${request.method} ${request.url} ${trouble}`);
}

/** The request's headers: its own, with the token only ever from `authorization`. */
function headersOf(request: HttpRequest): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const [name, value] of Object.entries(request.headers ?? {})) {
    if (name.toLowerCase() !== 'authorization') headers[name] = value;
  }
  if (request.authorization !== undefined) headers.Authorization = request.authorization;
  return headers;
}

/** Obsidian's `requestUrl`, which no browser's CORS rules hold back. */
export const obsidianHttp: Http = async (request) => {
  const { body, contentType } = bodyOf(request);
  let response: Awaited<ReturnType<typeof requestUrl>>;
  try {
    response = await requestUrl({
      url: request.url,
      method: request.method,
      headers: headersOf(request),
      ...(body === undefined ? {} : { body }),
      ...(contentType === undefined ? {} : { contentType }),
      throw: false,
    });
  } catch (error) {
    logTrouble(request, `failed: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
  let json: unknown = null;
  try {
    json = response.json;
  } catch {
    json = null;
  }
  // 4xx answers are expected (signed out, sign-in still pending, a refusal with its reason); these are not.
  if (response.status === 0 || response.status === 429 || response.status >= 500) {
    const code = field(json, 'error') ?? field(json, 'code');
    logTrouble(request, `answered ${response.status}${typeof code === 'string' ? ` (${code})` : ''}`);
  }
  return { status: response.status, json };
};
