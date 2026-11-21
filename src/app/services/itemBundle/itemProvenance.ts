/**
 * Where an item installed from the Armarium came from, kept in the item's own file (a template's
 * JSON, a preset's or dice set's record) under `armarium`: the listing, the version installed and
 * the fingerprint of the item as installed. It moves, syncs and goes with the file. It is never
 * exported and never counts as content: fingerprints leave it out, so it never makes an item look
 * changed. Pure.
 */

import type { ArmariumProvenance } from '../../types/armariumProvenance';
import { isRecord } from '../../utils/guards';

export type { ArmariumProvenance };

export const PROVENANCE_KEY = 'armarium';

const UID = /^[A-Za-z0-9-]{8,64}$/;
const FINGERPRINT = /^[0-9a-f]{64}$/;
const MAX_SOURCE = 200;

/** The provenance a stored value holds, when it is a sound one. */
export function readProvenance(value: unknown): ArmariumProvenance | undefined {
  if (!isRecord(value)) return undefined;
  const { uid, version, source, installed } = value;
  if (typeof uid !== 'string' || !UID.test(uid)) return undefined;
  if (typeof version !== 'number' || !Number.isSafeInteger(version) || version < 1) return undefined;
  if (typeof source !== 'string' || source === '' || source.length > MAX_SOURCE) return undefined;
  if (typeof installed !== 'string' || !FINGERPRINT.test(installed)) return undefined;
  return { uid, version, source, installed };
}

/** The provenance of an item file's top-level object, when it holds a sound one. */
export function provenanceOf(file: Readonly<Record<string, unknown>>): ArmariumProvenance | undefined {
  return Object.hasOwn(file, PROVENANCE_KEY) ? readProvenance(file[PROVENANCE_KEY]) : undefined;
}

/** The object without its provenance; the same object where it holds none. */
export function withoutProvenance<T extends Readonly<Record<string, unknown>>>(file: T): T {
  if (!Object.hasOwn(file, PROVENANCE_KEY)) return file;
  const { [PROVENANCE_KEY]: _provenance, ...rest } = file;
  return rest as T;
}

/** The object with `provenance` as its own, after every other key. */
export function withProvenance<T extends Readonly<Record<string, unknown>>>(file: T, provenance: ArmariumProvenance): T {
  return { ...withoutProvenance(file), [PROVENANCE_KEY]: { ...provenance } };
}

/** JSON text without the provenance of its top-level object; the text itself where it holds none or is no JSON object. */
export function stripProvenanceText(text: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return text;
  }
  if (!isRecord(parsed) || !Object.hasOwn(parsed, PROVENANCE_KEY)) return text;
  return `${JSON.stringify(withoutProvenance(parsed), null, 2)}\n`;
}
