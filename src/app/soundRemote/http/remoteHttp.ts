import { isRecord } from '../../utils/guards';

/**
 * How a controller on this computer (the Atlas Stream Deck plugin) reaches the remote: JSON over HTTP on
 * 127.0.0.1, the state pushed as server-sent events. Version 1; a controller reads `api` from `/v1/hello`
 * and a change that breaks it takes a new path prefix. What it sends and hears is `remoteProtocol`.
 */
export const REMOTE_API_VERSION = 1;

/** Fixed, so a controller finds Atlas without being told. */
export const REMOTE_PORT = 47823;

/** Every request carries it: a browser cannot send a header of its own to another origin without a preflight, which is refused. */
export const REMOTE_HEADER = 'x-atlas-remote';

/** Longest body a command or a pairing request may have. */
export const MAX_REMOTE_BODY = 4096;

/** Longest name a controller may give itself in the pairing prompt. */
export const MAX_CLIENT_NAME = 64;

export interface RemoteHello {
  app: 'atlas-vtt';
  api: number;
}

/** The name a controller gave itself, cut to what the prompt shows; anything else reads as no name. */
export function parseClientName(value: unknown): string | null {
  if (!isRecord(value) || typeof value.client !== 'string') return null;
  // Control characters could rearrange the prompt's text.
  const name = value.client.replace(/\p{Cc}/gu, '').trim().slice(0, MAX_CLIENT_NAME);
  return name.length > 0 ? name : null;
}
