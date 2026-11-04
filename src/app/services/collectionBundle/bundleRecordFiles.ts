import type { App } from 'obsidian';
import { isPathTaken } from '../../plugin/vaultFolders';
import { planRecords, recordFingerprint, type PackedRecord, type PlannedRecord, type VaultRecord } from '../vaultRecords/bundleRecords';
import { freeRecordPath, readRecordText, recordText, type RecordFolderSpec, type StoredRecord } from '../vaultRecords/recordFolder';
import type { RecordFolderFiles } from '../vaultRecords/RecordFolderFiles';
import { toBuffer } from './bundleContent';
import type { BundleFile, BundleFileRole, CollectionBundleManifest } from './bundleFormat';
import type { BundleFileReader } from './bundleReader';
import type { ImportJournal } from './importJournal';
import type { InstalledRecord } from './installRecord';

/** A kind of library record a bundle carries by id: user game system presets, dice sets. */
export interface BundledRecordKind {
  role: BundleFileRole;
  spec: RecordFolderSpec;
  /** The app's record files once the plugin opened them; undefined before (and in tests that open none). */
  files(app: App): RecordFolderFiles | undefined;
  /** Whether a carried record is one this kind can hold; unset: every record with an id. */
  isSound?(entry: StoredRecord): boolean;
  /** Whether a record no file holds has this name (a built-in's), which a carried one then may not take. */
  nameReserved?(name: string): boolean;
  /** The longest name a record may carry; unset: no limit. */
  maxNameLength?: number;
}

/** The record a file holds, when it is one the kind can hold. */
function readKindText(kind: BundledRecordKind, text: string): StoredRecord | null {
  const entry = readRecordText(kind.spec, text);
  return entry && (kind.isSound?.(entry) ?? true) ? entry : null;
}

/** `files` with the file of each record named, once; a record no file holds stays behind. */
export function withRecordFiles(app: App, kind: BundledRecordKind, files: readonly BundleFile[], named: ReadonlyArray<{ id: string; linkedFrom?: string[] | undefined }>): BundleFile[] {
  const store = kind.files(app);
  const next = [...files];
  for (const { id, linkedFrom } of named) {
    const path = store?.pathOf(id);
    if (!path || next.some((file) => file.vaultPath === path)) continue;
    next.push({ vaultPath: path, role: kind.role, ...(linkedFrom?.length ? { linkedFrom } : {}) });
  }
  return next;
}

/** Writes the record edits not yet on disk, so an export packs what the user sees. */
export async function flushRecordEdits(app: App, kind: BundledRecordKind): Promise<void> {
  await kind.files(app)?.flush();
}

/** What the publisher's install record keeps of a record file the export packs; null for a file that holds no record. */
export async function packedRecord(kind: BundledRecordKind, content: ArrayBuffer): Promise<InstalledRecord | null> {
  const entry = readKindText(kind, new TextDecoder().decode(content));
  if (!entry) return null;
  const fingerprint = await recordFingerprint(entry);
  return { localId: entry.id, source: fingerprint, installed: fingerprint };
}

/**
 * The records of the kind a bundle carries, each as `adjust` makes it (ids it names that came
 * in as copies); the first file of an id holds it, and a file that holds no record is left out.
 */
async function readBundleRecords(
  kind: BundledRecordKind,
  files: readonly BundleFile[],
  read: (path: string) => Promise<string | null>,
  adjust: (entry: StoredRecord) => StoredRecord,
): Promise<PackedRecord[]> {
  const records = new Map<string, PackedRecord>();
  for (const file of files) {
    if (file.role !== kind.role) continue;
    const text = await read(file.vaultPath);
    const stored = text === null ? null : readKindText(kind, text);
    const entry = stored && adjust(stored);
    if (entry && !records.has(entry.id)) records.set(entry.id, { path: file.vaultPath, entry, fingerprint: await recordFingerprint(entry) });
  }
  return [...records.values()];
}

/** The vault's records of the kind by id, with their edits written first. */
async function vaultRecords(app: App, kind: BundledRecordKind): Promise<Map<string, VaultRecord>> {
  const store = kind.files(app);
  if (!store) return new Map();
  await store.load();
  await store.flush();
  const records = new Map<string, VaultRecord>();
  for (const entry of store.entries()) {
    const path = store.pathOf(entry.id);
    const name = typeof entry.name === 'string' ? entry.name : '';
    if (path) records.set(entry.id, { id: entry.id, path, name, fingerprint: await recordFingerprint(entry) });
  }
  return records;
}

/**
 * The `n`th name for a copy of `name`, marked with the collection ("Sun and Moon (Fen)", "Sun and Moon (Fen) 2"):
 * within `max` characters, the record's own name cut short to make room. Where the collection's
 * name leaves no room, the copy is numbered alone.
 */
function copyNameFor(name: string, collectionName: string, n: number, max: number | undefined): string {
  const numbering = n > 1 ? ` ${n}` : '';
  const marked = ` (${collectionName})${numbering}`;
  if (max === undefined) return `${name}${marked}`;
  const tail = marked.length < max ? marked : numbering;
  return `${name.slice(0, max - tail.length).trimEnd()}${tail}`;
}

/**
 * Reads the bundle's records of the kind and decides, by id, what becomes of each
 * (`planRecords`). A copy is named after the collection ("Homebrew (Fen)"), new files go to the
 * kind's folder.
 */
export async function planRecordImport(
  app: App,
  kind: BundledRecordKind,
  manifest: CollectionBundleManifest,
  files: BundleFileReader,
  installed: Readonly<Record<string, InstalledRecord>> | undefined,
  collectionName: string,
  adjust: (entry: StoredRecord) => StoredRecord = (entry) => entry,
): Promise<PlannedRecord[]> {
  const bundle = await readBundleRecords(kind, manifest.files, (path) => files.text(path), adjust);
  if (bundle.length === 0) return [];
  const vault = await vaultRecords(app, kind);
  const claimedPaths = new Set<string>();
  const claimedNames = new Set([...vault.values()].map((record) => record.name.toLowerCase()));
  const nameTaken = (name: string): boolean => claimedNames.has(name.toLowerCase()) || (kind.nameReserved?.(name) ?? false);
  return planRecords(bundle, vault, installed, {
    place: (name) => {
      const path = freeRecordPath(kind.spec, name, (candidate) => claimedPaths.has(candidate.toLowerCase()) || isPathTaken(app, candidate));
      claimedPaths.add(path.toLowerCase());
      return path;
    },
    copyName: (name) => {
      let copy = copyNameFor(name, collectionName, 1, kind.maxNameLength);
      for (let n = 2; nameTaken(copy); n++) copy = copyNameFor(name, collectionName, n, kind.maxNameLength);
      claimedNames.add(copy.toLowerCase());
      return copy;
    },
    newId: () => crypto.randomUUID(),
    nameReserved: (name) => kind.nameReserved?.(name) ?? false,
  });
}

/** Whether the vault's records changed since the review: one the decision read differs now, or a file took a new one's path. */
export async function recordsChangedSinceReview(app: App, kind: BundledRecordKind, planned: readonly PlannedRecord[]): Promise<boolean> {
  if (planned.length === 0) return false;
  const vault = await vaultRecords(app, kind);
  return planned.some((record) => (record.mine === null
    ? isPathTaken(app, record.target)
    : vault.get(record.localId)?.fingerprint !== record.mine));
}

/** Writes the records the plan brings in or updates, through the import's journal; returns how many. */
export async function writeRecords(app: App, kind: BundledRecordKind, journal: Pick<ImportJournal, 'write'>, planned: readonly PlannedRecord[]): Promise<number> {
  let written = 0;
  for (const record of planned) {
    if (!record.entry) continue;
    const text = recordText(kind.spec, record.entry);
    await journal.write(record.target, toBuffer(text));
    kind.files(app)?.recordWrite(record.target, text);
    written += 1;
  }
  return written;
}
