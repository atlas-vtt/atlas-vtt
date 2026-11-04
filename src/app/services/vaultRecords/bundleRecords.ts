/**
 * Library records in collection bundles (a user game system preset, a dice set): a collection
 * that names one carries its file, and an import matches it by id, never by path. Pure.
 *
 * - A record the vault lacks comes in under its own id.
 * - The same record (by content) is reused.
 * - One the vault holds as the last import left it is updated in place, silently.
 * - One the vault changed is never overwritten: the bundle's version comes in as a copy with a
 *   new id and name, and what the bundle points at it is pointed at the copy.
 */

import type { InstalledRecord } from '../collectionBundle/installRecord';
import { hashJson } from '../../utils/hashing';
import type { StoredRecord } from './recordFolder';

/** A record as a bundle carries it, read and fingerprinted. */
export interface PackedRecord {
  /** Its file's path in the bundle. */
  path: string;
  entry: StoredRecord;
  fingerprint: string;
}

/** A record of the vault, by the id it holds. */
export interface VaultRecord {
  id: string;
  path: string;
  name: string;
  fingerprint: string;
}

/**
 * - `new`: written under its id (the bundle's, or the copy a previous import made, which was deleted).
 * - `reuse`: the vault has the same record.
 * - `keep`: the bundle's version is the one installed last time, and the vault changed it since.
 * - `update`: the vault holds it as installed last time; the bundle's version replaces it.
 * - `copy`: the vault's own differs; the bundle's version comes in beside it with a new id.
 */
export type RecordOutcome = 'new' | 'reuse' | 'keep' | 'update' | 'copy';

export interface PlannedRecord {
  bundleId: string;
  name: string;
  /** Its id in this vault after the import. */
  localId: string;
  /** Where its file is, or will be, in this vault. */
  target: string;
  outcome: RecordOutcome;
  /** Fingerprint of the vault's record the decision read; null when the vault had none. */
  mine: string | null;
  theirs: string;
  /** The record as the import writes it; unset for the records it leaves alone. */
  entry?: StoredRecord | undefined;
}

export interface RecordPlanRules {
  /** A free path for a record file of this name; each path given out is taken. */
  place(name: unknown): string;
  /** A name for a copy of the record that no record of the vault has. */
  copyName(name: string): string;
  newId(): string;
  /** Whether a record the vault does not store has this name (a built-in's); unset: none has. */
  nameReserved?(name: string): boolean;
}

type InstalledRecords = Readonly<Record<string, InstalledRecord>> | undefined;

/** Fingerprint of a record without its id and file format, so a copy under another id is the same record. */
export function recordFingerprint(entry: Readonly<Record<string, unknown>>): Promise<string> {
  const { id: _id, format: _format, ...content } = entry;
  return hashJson(content);
}

const nameOf = (entry: StoredRecord): string => (typeof entry.name === 'string' ? entry.name : '');

/** What the install record says of a bundle record, when it is sound. */
function installedOf(installed: InstalledRecords, bundleId: string): InstalledRecord | undefined {
  const entry = installed && Object.hasOwn(installed, bundleId) ? installed[bundleId] : undefined;
  return entry && typeof entry.localId === 'string' && entry.localId !== '' ? entry : undefined;
}

/** Decides what becomes of each record the bundle carries. */
export function planRecords(
  bundle: readonly PackedRecord[],
  vault: ReadonlyMap<string, VaultRecord>,
  installed: InstalledRecords,
  rules: RecordPlanRules,
): PlannedRecord[] {
  // Record names are unique in a vault, in any letter case.
  const nameTaken = (name: string, exceptId: string): boolean => (rules.nameReserved?.(name) ?? false)
    || [...vault.values()].some((record) => record.id !== exceptId && record.name.toLowerCase() === name.toLowerCase());
  return bundle.map(({ entry, fingerprint }): PlannedRecord => {
    const name = nameOf(entry);
    const base = { bundleId: entry.id, name, theirs: fingerprint };
    const record = installedOf(installed, entry.id);
    const installedHere = record ? vault.get(record.localId) : undefined;
    // An installed copy that is gone leaves the bundle's id to compare by.
    const local = installedHere ?? vault.get(entry.id);
    if (!local) {
      const localId = record?.localId ?? entry.id;
      const localName = nameTaken(name, localId) ? rules.copyName(name) : name;
      return { ...base, name: localName, localId, target: rules.place(localName), outcome: 'new', mine: null, entry: { ...entry, id: localId, name: localName } };
    }
    const found = { ...base, localId: local.id, target: local.path, mine: local.fingerprint };
    if (local.fingerprint === fingerprint) return { ...found, outcome: 'reuse' };
    if (installedHere && record?.source === fingerprint) return { ...found, outcome: 'keep' };
    if (installedHere && record?.installed === local.fingerprint) {
      const localName = nameTaken(name, local.id) ? local.name : name;
      return { ...found, name: localName, outcome: 'update', entry: { ...entry, id: local.id, name: localName } };
    }
    const copyName = rules.copyName(name);
    const copy = { ...entry, id: rules.newId(), name: copyName };
    return { ...base, name: copyName, localId: copy.id, target: rules.place(copyName), outcome: 'copy', mine: null, entry: copy };
  });
}

/** Bundle record id → the id the record has here, where the two differ. */
export function recordIdMap(planned: readonly PlannedRecord[]): ReadonlyMap<string, string> {
  return new Map(planned.flatMap((record): Array<[string, string]> => (record.localId === record.bundleId ? [] : [[record.bundleId, record.localId]])));
}

/**
 * What the install record keeps of each record: a kept one its earlier entry, the others the
 * bundle's version as source and what the import left in the vault (a new name, perhaps) as installed.
 */
export async function installedRecords(planned: readonly PlannedRecord[], previous: InstalledRecords): Promise<Record<string, InstalledRecord>> {
  const entries: Array<[string, InstalledRecord]> = [];
  for (const record of planned) {
    const earlier = record.outcome === 'keep' ? installedOf(previous, record.bundleId) : undefined;
    const installed = record.entry ? await recordFingerprint(record.entry) : record.theirs;
    entries.push([record.bundleId, earlier ?? { localId: record.localId, source: record.theirs, installed }]);
  }
  return Object.fromEntries(entries);
}
