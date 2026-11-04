import { isRecord } from '../../utils/guards';
import { isRecordFileCandidate } from '../library/libraryPaths';
import { RECORD_KEY } from '../library/recordFile';
import { toBuffer } from './bundleContent';

const decoder = new TextDecoder();

/**
 * A record file as bundles carry and compare it: the payload alone, as versions
 * before record files wrote it. The record beside it is the vault's own (its
 * timestamps change with every edit) and travels in the manifest instead, so
 * bundles stay readable by older versions and an update never mistakes Atlas
 * rewriting a record for the user changing the file.
 */
export function payloadBytes(path: string, raw: ArrayBuffer): ArrayBuffer {
  return withoutKeys(path, raw, [RECORD_KEY]);
}

/** A map's JSON repeats its record, with the collection it lies in: that differs between vaults and after a rename, so bundles compare maps without it. */
const MAP_FILE = /\/maps\/.+\.json$/;

/**
 * A record file as bundles carry it and updates compare it: its payload, and for
 * a map without the collection it names, so Atlas rewriting it after an import
 * under another name or a collection rename is no change by the user.
 */
export function comparedBytes(path: string, raw: ArrayBuffer): ArrayBuffer {
  return withoutKeys(path, raw, MAP_FILE.test(path) ? [RECORD_KEY, 'collection'] : [RECORD_KEY]);
}

function withoutKeys(path: string, raw: ArrayBuffer, keys: readonly string[]): ArrayBuffer {
  if (!isRecordFileCandidate(path)) return raw;
  const text = decoder.decode(raw);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return raw;
  }
  if (!isRecord(parsed) || !keys.some((key) => key in parsed)) return raw;
  const kept = Object.fromEntries(Object.entries(parsed).filter(([key]) => !keys.includes(key)));
  return toBuffer(JSON.stringify(kept, null, 2));
}
