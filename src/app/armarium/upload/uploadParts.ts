/** The pure rules of an upload in parts: which bytes a part holds and what a failure means. */

export interface PartRange {
  /** Parts count from 1. */
  n: number;
  start: number;
  /** Exclusive. */
  end: number;
}

/** The parts of a file of `bytes`: each `partBytes` long, the last one the remainder. */
export function partRanges(bytes: number, partBytes: number): PartRange[] {
  if (!Number.isInteger(bytes) || bytes < 1 || !Number.isInteger(partBytes) || partBytes < 1) throw new RangeError('A file and its parts hold at least one byte');
  return Array.from({ length: Math.ceil(bytes / partBytes) }, (_, index): PartRange => ({ n: index + 1, start: index * partBytes, end: Math.min(bytes, (index + 1) * partBytes) }));
}

/** How often a part that failed on its way is sent again before the GM is asked. */
export const RETRIES = 2;
const RETRY_DELAYS_MS = [1000, 4000];

/** Failures of the way, not of the upload: no answer, a fault of the API, a part damaged in transit, a rate limit. */
const PASSING = new Set(['network', 'bad-part-hash', 'too-many-requests']);
/** Answers after which the ticket takes no more parts. */
const TICKET_ENDED = new Set(['upload-expired', 'wrong-state', 'not-found', 'upload-corrupt', 'upload-gone']);

export type FailurePlan = { action: 'retry'; delayMs: number } | { action: 'stop'; keepTicket: boolean };

/**
 * What to do after a part or the completion failed for the `attempt`-th time (from 0). A refusal (uploads closed, the
 * day's limit, the account's own) stops at once and keeps the ticket, so Retry goes on where it stopped.
 */
export function failurePlan(failure: { status: number; code: string }, attempt: number): FailurePlan {
  if (ticketEnded(failure)) return { action: 'stop', keepTicket: false };
  const passing = PASSING.has(failure.code) || failure.status >= 500;
  const delayMs = RETRY_DELAYS_MS[attempt];
  return passing && attempt < RETRIES && delayMs !== undefined ? { action: 'retry', delayMs } : { action: 'stop', keepTicket: true };
}

/** Whether `failure` ended the ticket: the upload can only start again with a new one. */
export function ticketEnded(failure: { status: number; code: string }): boolean {
  return TICKET_ENDED.has(failure.code);
}
