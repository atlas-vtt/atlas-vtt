import { requestUrl } from 'obsidian';
import { bodyOf, field, type Http, type HttpRequest } from './http.ts';

/**
 * Says in the console why a request got no usable answer, so a GM can send it to us: the dock only
 * shows "Can't reach". URLs never hold a token (`HttpRequest`), and the error text names none.
 */
function logTrouble(request: HttpRequest, trouble: string): void {
  console.warn(`[Atlas] Online play: ${request.method} ${request.url} ${trouble}`);
}

/** Obsidian's `requestUrl`, which no browser's CORS rules hold back. */
export const obsidianHttp: Http = async (request) => {
  const { body, contentType } = bodyOf(request);
  let response: Awaited<ReturnType<typeof requestUrl>>;
  try {
    response = await requestUrl({
      url: request.url,
      method: request.method,
      headers: request.authorization === undefined ? {} : { Authorization: request.authorization },
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
  // 4xx answers are expected (signed out, sign-in still pending); these are not.
  if (response.status === 0 || response.status === 429 || response.status >= 500) {
    const code = field(json, 'error');
    logTrouble(request, `answered ${response.status}${typeof code === 'string' ? ` (${code})` : ''}`);
  }
  return { status: response.status, json };
};
