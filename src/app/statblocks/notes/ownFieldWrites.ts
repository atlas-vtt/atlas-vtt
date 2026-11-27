import type { FieldKey, FieldValue } from '../model/templateTypes';
import type { FieldRead } from '../values/fieldValues';
import { deepEqual } from './listIdentity';
import type { WriteOutcome } from './NoteFieldWriter';

/** A write of a surface's own the note may not hold yet: what it started from and what it wrote. */
export interface OwnWrite {
  base: FieldValue | undefined;
  mine: FieldValue | undefined;
}

/**
 * What field `key` holds once the surface's own last write of it (in `own`) has landed: the value
 * it wrote while the note (`now`) still holds what that write started from, else what the note
 * holds, and the write is forgotten. A second press right after the first builds on the first.
 */
export function readAfterOwnWrite(now: FieldRead, key: FieldKey, own: Map<FieldKey, OwnWrite>): FieldRead {
  const write = own.get(key);
  if (!write) return now;
  if (deepEqual(now.value, write.base)) return { value: write.mine, key, viaFormerKey: false };
  // The note took the write, or something else changed it since: what it holds is the value.
  own.delete(key);
  return now;
}

/**
 * Sends a write of field `key` as the surface's own (`write`, or null for one that is no whole
 * value) and forgets it again where the note refused it, so the next read is the note's. A write
 * built on the surface's last one keeps that one's base: until the first of them lands, the note
 * still holds what the first started from (disk writes of a note wait to be written together).
 */
export async function sendOwnWrite(own: Map<FieldKey, OwnWrite>, key: FieldKey, write: OwnWrite | null, send: () => Promise<WriteOutcome>): Promise<WriteOutcome> {
  const last = own.get(key);
  const sent = write && last && deepEqual(last.mine, write.base) ? { base: last.base, mine: write.mine } : write;
  if (sent) own.set(key, sent);
  const outcome = await send();
  if ((outcome.conflicts.length > 0 || outcome.problem) && own.get(key) === sent) own.delete(key);
  return outcome;
}
