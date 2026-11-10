import { MAX_GM_FRAME, PROTOCOL_VERSION, SECRET_PATTERN } from './relay.ts';
import { isRecord } from './shape.ts';

/**
 * The stream lane: a player's connection to the table for a browser or network in which no WebSocket
 * opens. Down, the relay's frames come as one streamed answer to the request that carried the hello
 * (`streamPath`), in the framing of server-sent events; up, the page posts its frames in small
 * batches (`streamSendPath`) with the session's secret, which the stream's first line hands it. The
 * frames, the close codes and every rule of the table are the socket's. The GM never uses it.
 */

/** Where a player's page opens its stream, with its hello as the body. */
export const streamPath = (code: string): string => `/api/tables/${code}/stream`;
/** Where it posts what it sends. */
export const streamSendPath = (code: string): string => `${streamPath(code)}/send`;

/** The stream's content type: the one every proxy knows not to buffer. */
export const STREAM_CONTENT_TYPE = 'text/event-stream';
/** How often the relay writes a line that says nothing, so the path stays open and a page hears that the stream lives. */
export const STREAM_BEAT_MS = 15_000;
/** Frames one post carries at most. */
export const MAX_STREAM_BATCH = 32;
/** Bytes of a post's body at most. */
export const MAX_STREAM_BODY = 64 * 1024;
/** Bytes of the body that opens a stream at most: one hello. */
export const MAX_STREAM_HELLO = 16 * 1024;
/** The longest line a page reads: a GM's largest frame and its envelope. */
export const MAX_STREAM_LINE = MAX_GM_FRAME + 1024;
/** The close code a page takes for a stream that ended without the relay's word, as a browser says of a socket. */
export const STREAM_LOST = 1006;

/** What a stream carries: the session's secret (first), the relay's frames, the answer to a ping, a beat, and the relay's close as its last word. */
export type StreamLine =
  | { readonly kind: 'session'; readonly secret: string }
  | { readonly kind: 'frame'; readonly text: string }
  | { readonly kind: 'pong' }
  | { readonly kind: 'beat' }
  | { readonly kind: 'close'; readonly code: number; readonly reason: string };

const event = (name: string, data: string): string => `event: ${name}\n${dataLines(data)}\n`;
/** Text as the data of one event: a line break in it starts another data line. */
const dataLines = (text: string): string => text.split(/\r\n|\r|\n/).map((line) => `data: ${line}\n`).join('');

export const sessionLine = (secret: string): string => event('session', secret);
export const frameLine = (text: string): string => `${dataLines(text)}\n`;
export const closeLine = (code: number, reason: string): string => event('close', JSON.stringify({ code, reason }));
export const PONG_LINE: string = event('pong', '');
export const BEAT_LINE = ':\n\n';

function lineOf(name: string, data: string): StreamLine | null {
  if (name === '') return { kind: 'frame', text: data };
  if (name === 'pong') return { kind: 'pong' };
  if (name === 'session') return SECRET_PATTERN.test(data) ? { kind: 'session', secret: data } : null;
  if (name !== 'close') return null;
  const value = parseJson(data);
  if (!isRecord(value) || typeof value.code !== 'number' || !Number.isInteger(value.code) || value.code < 1000 || value.code > 4999) return null;
  return { kind: 'close', code: value.code, reason: typeof value.reason === 'string' ? value.reason.slice(0, 200) : '' };
}

/**
 * Reads a stream as it arrives, in pieces cut anywhere. An event of a kind this build does not know
 * is passed over, so a later relay may say more.
 */
export class StreamReader {
  private rest = '';
  private name = '';
  private data: string[] | null = null;

  /** The lines `text` completes, or null for a stream that is none: a line longer than any the relay writes. */
  read(text: string): StreamLine[] | null {
    const lines: StreamLine[] = [];
    // Nothing kept from before holds a line's end: the search starts where the new text does.
    const start = this.rest.length;
    this.rest += text;
    let from = 0;
    for (let end = this.rest.indexOf('\n', start); end !== -1; end = this.rest.indexOf('\n', from)) {
      const read = this.field(this.rest.slice(from, end).replace(/\r$/, ''));
      if (read !== null) lines.push(read);
      from = end + 1;
    }
    this.rest = this.rest.slice(from);
    return this.rest.length > MAX_STREAM_LINE ? null : lines;
  }

  /** One line of the stream: a field of the event being read, a comment, or the empty line that ends an event. */
  private field(line: string): StreamLine | null {
    if (line === '') {
      const { name, data } = this;
      this.name = '';
      this.data = null;
      return data === null ? null : lineOf(name, data.join('\n'));
    }
    if (line.startsWith(':')) return { kind: 'beat' };
    const colon = line.indexOf(':');
    const key = colon === -1 ? line : line.slice(0, colon);
    const value = colon === -1 ? '' : line.slice(colon + 1).replace(/^ /, '');
    if (key === 'event') this.name = value;
    else if (key === 'data') (this.data ??= []).push(value);
    return null;
  }
}

/**
 * What a page posts: the session's secret, the frames in the order they were sent, whether the relay
 * shall answer on the stream (`ping`), and whether the page lets its stream go (`bye`: the relay
 * ends it as a closed socket, since a request that was aborted is not always heard of).
 */
export interface StreamSend {
  readonly v: 1;
  readonly s: string;
  readonly frames: readonly string[];
  readonly ping?: true;
  readonly bye?: true;
}

/** The body of a post. */
export function streamSendBody(secret: string, frames: readonly string[], say: { readonly ping?: boolean; readonly bye?: boolean } = {}): string {
  return JSON.stringify({ v: PROTOCOL_VERSION, s: secret, frames, ...(say.ping === true ? { ping: true } : {}), ...(say.bye === true ? { bye: true } : {}) } satisfies StreamSend);
}

/** A post read from its body's text, or null for anything malformed; the frames themselves are left unread. */
export function parseStreamSend(text: string): StreamSend | null {
  const value = parseJson(text);
  if (!isRecord(value) || value.v !== PROTOCOL_VERSION || typeof value.s !== 'string' || !SECRET_PATTERN.test(value.s)) return null;
  const { frames, ping, bye } = value;
  if (!Array.isArray(frames) || frames.length > MAX_STREAM_BATCH || !frames.every((frame): frame is string => typeof frame === 'string')) return null;
  if ((ping !== undefined && ping !== true) || (bye !== undefined && bye !== true)) return null;
  return { v: 1, s: value.s, frames, ...(ping === true ? { ping: true as const } : {}), ...(bye === true ? { bye: true as const } : {}) };
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
