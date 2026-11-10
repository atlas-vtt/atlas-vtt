/** A record as stored, with every field a newer Atlas may have added. */
export type StoredRecord = Record<string, unknown> & { id: string };

/**
 * Where and how one kind of record lives in the vault: which files hold one, how a file reads and
 * is written, and what carries its name (the file itself, or the folder it stands in).
 */
export interface RecordLayout<Stored extends StoredRecord> {
  /** The folder read at load; every record file lies in it or below. */
  readonly root: string;
  /** What a failed write says it was writing. */
  readonly kind: string;
  isRecordPath(path: string): boolean;
  /** The record a file holds, or null when it holds none. */
  read(text: string): Stored | null;
  /** The file text for a record. */
  text(record: Stored): string;
  /** The path that carries a record file's name: the file, or the folder it stands in. */
  namedPath(recordPath: string): string;
  /** The record file a named path holds. */
  recordPathIn(namedPath: string): string;
  /** A free named path for `name`; `isTaken` answers in any letter case. */
  freeNamedPath(name: unknown, isTaken: (path: string) => boolean): string;
  /** Whether a named path is named after `name`. */
  isNamedAfter(namedPath: string, name: unknown): boolean;
  /**
   * Where two files hold one id (a conflict copy, a copied folder): the one named after its record
   * holds it, before the lower path. Unset, the lower path alone decides.
   */
  readonly namedHolds?: boolean;
}

/** The file text for a record: its format first (a later one keeps its own number), then the record as stored. */
export function recordText(record: StoredRecord, format: number): string {
  const kept = typeof record.format === 'number' && record.format > format ? record.format : format;
  // Assigned twice, so the format leads the file and an older number is replaced.
  return `${JSON.stringify(Object.assign({ format: kept }, record, { format: kept }), null, 2)}\n`;
}

/** The record a JSON file holds, or null when it is not JSON or `isRecord` refuses it. */
export function readRecordText<Stored extends StoredRecord>(text: string, isRecord: (value: unknown) => value is Stored): Stored | null {
  try {
    const parsed: unknown = JSON.parse(text);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Whether `path` is `folder` or lies inside it. */
export function isWithin(path: string, folder: string): boolean {
  return path === folder || path.startsWith(`${folder}/`);
}
