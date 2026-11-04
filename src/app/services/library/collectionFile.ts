import type { AssetMetadata, CollectionMetadata } from '../AssetService';
import { isRecord } from '../../utils/guards';

/** The format of `collection.json` and `library.json` this version writes; a higher one comes from a newer Atlas and is never rewritten. */
export const LIBRARY_FILE_FORMAT = 1;

/** The library-wide facts `library.json` holds. */
export interface LibraryFacts {
  defaultCollectionId?: string;
  vaultId?: string;
  /** The starter tokens were added once; deleted ones stay deleted on every device. */
  starterTokensAdded?: boolean;
}

/** A parsed `collection.json` or `library.json`, with the format it was written in. */
export interface ParsedLibraryFile<T> {
  format: number;
  value: T;
}

function parseObject(text: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(text);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

const formatOf = (value: Record<string, unknown>): number =>
  (typeof value.format === 'number' && Number.isFinite(value.format) ? value.format : LIBRARY_FILE_FORMAT);

/** The content of a collection's `collection.json`; its id and name are its folder's name and are not stored, so renaming the folder leaves the file as it is. */
export function serializeCollection(collection: CollectionMetadata): string {
  const { id: _id, name: _name, ...stored } = collection;
  return JSON.stringify({ format: LIBRARY_FILE_FORMAT, ...stored }, null, 2);
}

/**
 * Reads a collection's `collection.json` for the folder `id`. Fields a newer
 * Atlas wrote are kept. Null when the file holds no collection.
 */
export function parseCollectionFile(text: string, id: string): ParsedLibraryFile<CollectionMetadata> | null {
  const parsed = parseObject(text);
  if (!parsed || typeof parsed.uid !== 'string' || !parsed.uid) return null;
  const { format: _format, ...fields } = parsed;
  const createdAt = typeof fields.createdAt === 'number' ? fields.createdAt : 0;
  const collection: Record<string, unknown> = {
    ...fields,
    id,
    version: typeof fields.version === 'number' ? fields.version : 1,
    name: id,
    tags: isRecord(fields.tags) ? fields.tags : {},
    settings: isRecord(fields.settings) ? fields.settings : { conditions: [] },
    createdAt,
    modifiedAt: typeof fields.modifiedAt === 'number' ? fields.modifiedAt : createdAt,
  };
  return isCollectionRecord(collection) ? { format: formatOf(parsed), value: collection } : null;
}

/** Whether `value` has the shape of a collection record; settings are checked where they are read, as for the index. */
function isCollectionRecord(value: unknown): value is CollectionMetadata {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.uid === 'string'
    && typeof value.version === 'number'
    && typeof value.name === 'string'
    && isRecord(value.tags)
    && isRecord(value.settings)
    && typeof value.createdAt === 'number'
    && typeof value.modifiedAt === 'number';
}

/** The library facts of an index. */
export function libraryFactsOf(metadata: AssetMetadata): LibraryFacts {
  const facts: LibraryFacts = {};
  if (metadata.defaultCollectionId !== undefined) facts.defaultCollectionId = metadata.defaultCollectionId;
  if (metadata.vaultId !== undefined) facts.vaultId = metadata.vaultId;
  if (metadata.starterTokensAdded) facts.starterTokensAdded = true;
  return facts;
}

export function serializeLibrary(facts: LibraryFacts): string {
  return JSON.stringify({ format: LIBRARY_FILE_FORMAT, ...facts }, null, 2);
}

/** Reads `library.json`; fields it does not know are left out, since nothing else lives in it. */
export function parseLibraryFile(text: string): ParsedLibraryFile<LibraryFacts> | null {
  const parsed = parseObject(text);
  if (!parsed) return null;
  const facts: LibraryFacts = {};
  if (typeof parsed.defaultCollectionId === 'string' && parsed.defaultCollectionId) facts.defaultCollectionId = parsed.defaultCollectionId;
  if (typeof parsed.vaultId === 'string' && parsed.vaultId) facts.vaultId = parsed.vaultId;
  if (parsed.starterTokensAdded === true) facts.starterTokensAdded = true;
  return { format: formatOf(parsed), value: facts };
}
