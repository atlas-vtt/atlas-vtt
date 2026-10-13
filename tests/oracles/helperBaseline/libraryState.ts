// Frozen from 29c9495a src/app/services/library/libraryState.ts. Only import paths are adapted.
import { isRecord } from '../../../src/app/utils/guards';

/** What this device last knew of one library file, so unchanged files are neither read nor written again. */
export interface FileStamp {
  /**
   * The entity the file holds: `asset:<id>`, `collection:<id>`, `library`, `duplicate:<id>` for
   * another file holding a record, or `copy:<copy id>` for a file a copied folder brought, which
   * stands for a record of its own until the user changes it.
   */
  key: string;
  hash: string;
  mtime: number;
  size: number;
  /** Written by a newer Atlas: read, never rewritten or removed. */
  readOnly?: true;
}

/**
 * Device-local bookkeeping beside the index cache. Never synced on purpose:
 * each device knows only what it has read and written itself.
 */
export interface LibraryState {
  /** Library files as this device last read or wrote them, by path. */
  files: Record<string, FileStamp>;
  /**
   * Records Atlas worked out from the vault rather than the user made (art found
   * in a tokens folder, a folder that appeared, the first collection), by
   * identity, with the hash of their content then. They stay unwritten until the
   * user changes them, so two devices never write what each of them can work out alone.
   */
  derived: Record<string, string>;
}

export const emptyLibraryState = (): LibraryState => ({ files: {}, derived: {} });

/**
 * How long a file that looks like a copy (a folder copied beside its original)
 * must stand before it is taken in as one: a sync tool may deliver another
 * device's rename as the new folder first and the old one's deletion later,
 * and within this time that reads as the move it is.
 */
export const COPY_SETTLE_MS = 60_000;

/** The clock copies are timed by; tests move it on. */
export const libraryClock = { now: (): number => Date.now() };

export const assetKey = (id: string): string => `asset:${id}`;
export const collectionKey = (id: string): string => `collection:${id}`;
/** A collection's identity, which survives renaming its folder; derived records are kept by identity. */
export const collectionIdentity = (uid: string): string => `collection-uid:${uid}`;
export const LIBRARY_KEY = 'library';
export const duplicateKey = (id: string): string => `duplicate:${id}`;
export const copyKey = (copyId: string): string => `copy:${copyId}`;

/** The id of an `asset:`, `collection:`, `duplicate:` or `copy:` key, or null for another kind. */
export function idOfKey(key: string, kind: 'asset' | 'collection' | 'duplicate' | 'copy'): string | null {
  const prefix = `${kind}:`;
  return key.startsWith(prefix) ? key.slice(prefix.length) : null;
}

/** A 53-bit hash of `text` (cyrb53), enough to tell file contents apart. */
export function hashText(text: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ code, 2654435761);
    h2 = Math.imul(h2 ^ code, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

const isStamp = (value: unknown): value is FileStamp =>
  isRecord(value)
  && typeof value.key === 'string'
  && typeof value.hash === 'string'
  && typeof value.mtime === 'number'
  && typeof value.size === 'number';

/** Reads a stored state, keeping only well-formed entries; anything else starts empty, which only costs reading files again. */
export function parseLibraryState(parsed: unknown): LibraryState {
  if (!isRecord(parsed)) return emptyLibraryState();
  const state = emptyLibraryState();
  if (isRecord(parsed.files)) {
    for (const [path, stamp] of Object.entries(parsed.files)) if (isStamp(stamp)) state.files[path] = stamp;
  }
  if (isRecord(parsed.derived)) {
    for (const [key, hash] of Object.entries(parsed.derived)) if (typeof hash === 'string') state.derived[key] = hash;
  }
  return state;
}
