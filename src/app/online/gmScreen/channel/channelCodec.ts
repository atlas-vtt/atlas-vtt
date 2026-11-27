import type { Opening, Sealing } from './seal';

/** What an end of a channel tells its owner. */
export interface ChannelEvents<M> {
  /** An exchange finished: from now on messages pass, and whatever the other end should hold goes out again. */
  opened(): void;
  /** A message from the other end, read by its bounded parser. */
  message(message: M): void;
  /** The other end speaks another version of the GM screen's messages: nothing passes until one of them is updated. */
  otherVersion?(version: number): void;
}

/** The keys of the exchange in force: one to seal what this end sends, one to open what it receives. */
export interface ChannelKeys {
  readonly sealing: Sealing;
  readonly opening: Opening;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });

/** A message's JSON in UTF-8, or null when it is larger than `max` bytes. */
export function encodeMessage(message: unknown, max: number): Uint8Array<ArrayBuffer> | null {
  const bytes = encoder.encode(JSON.stringify(message));
  return bytes.length <= max ? bytes : null;
}

/** An opened frame's message as `parse` reads it; null for bytes that are no JSON or no message. */
export function decodeMessage<M>(bytes: Uint8Array, parse: (value: unknown) => M | null): M | null {
  try {
    return parse(JSON.parse(decoder.decode(bytes)));
  } catch {
    return null;
  }
}
