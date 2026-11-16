import { isRecord } from './shape.ts';

/** The most game messages one `sends` frame of the GM carries. */
export const MAX_BATCH_SENDS = 64;

/** One game message of a GM's `sends` frame: to one player, or to all (`ALL_PLAYERS`). */
export interface BatchedSend {
  readonly to: string;
  readonly body: unknown;
}

/** A GM's `sends` frame: one to `MAX_BATCH_SENDS` messages, each with whom it goes to; null for anything else. Bodies are left unread. */
export function parseSends(value: unknown): BatchedSend[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_BATCH_SENDS) return null;
  const sends: BatchedSend[] = [];
  for (const entry of value) {
    if (!isRecord(entry) || typeof entry.to !== 'string' || !('body' in entry)) return null;
    sends.push({ to: entry.to, body: entry.body });
  }
  return sends;
}
