import { sha256 } from '../utils/hashing';
import { REMOTE_HEADER } from './remoteProtocol';

/** The headers of a request, as Node gives them: names in lower case. */
export type RequestHeaders = Readonly<Record<string, string | string[] | undefined>>;

const TOKEN_BYTES = 32;

/**
 * Why a request is refused before anything else is looked at, or null. Only a program on this computer may
 * talk to the remote: a web page could reach 127.0.0.1 too, so whatever a browser marks its requests with
 * (an `Origin`, the `Sec-Fetch-*` headers) is refused, and a `Host` other than this address is a name some
 * page made point here (DNS rebinding). The remote header is the third guard: no page can add it to a
 * request elsewhere without a preflight, which the remote never answers.
 */
export function requestRefusal(headers: RequestHeaders, port: number): string | null {
  const host = headers.host;
  if (host !== `127.0.0.1:${port}` && host !== `localhost:${port}`) return 'host';
  if (headers.origin !== undefined || headers.referer !== undefined) return 'browser';
  if (Object.keys(headers).some((name) => name.startsWith('sec-fetch-'))) return 'browser';
  if (headers[REMOTE_HEADER] !== '1') return 'header';
  return null;
}

/** The bearer token of a request, or null. */
export function bearerToken(headers: RequestHeaders): string | null {
  const value = headers.authorization;
  if (typeof value !== 'string' || !value.startsWith('Bearer ')) return null;
  const token = value.slice('Bearer '.length);
  return /^[0-9a-f]{64}$/.test(token) ? token : null;
}

/** A new token: 256 random bits, hex. */
export function newRemoteToken(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(TOKEN_BYTES)),(byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** What is stored of a token: never the token itself. */
export function remoteTokenHash(token: string): Promise<string> {
  return sha256(new TextEncoder().encode(token));
}

/** Compares two hashes in time that does not depend on where they differ. */
export function sameHash(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index++) difference |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return difference === 0;
}
