import type { AssetMetadata } from '../AssetService';
import { libraryFactsOf, type LibraryFacts } from './collectionFile';

/** The JSON of each entry of a record of records (the index's assets, its collections), by key, in the record's order. */
type EntryTexts = ReadonlyMap<string, string>;

/**
 * The index at one moment, as JSON text: what a save writes, whatever the index
 * becomes while the save waits on the disk. Every asset and collection has a
 * text of its own, by which a save tells the ones that changed since the last
 * (`LibraryFileMemo`) and of which the cache's text is put together
 * (`indexText`), so a save serializes the index once and nothing twice.
 */
export interface IndexSnapshot {
  readonly assets: EntryTexts;
  readonly collections: EntryTexts;
  /** What `library.json` holds. */
  readonly library: LibraryFacts;
  /** The index's fields in their order, each with its JSON; assets and collections with their entries'. */
  readonly fields: ReadonlyArray<readonly [name: string, json: string | EntryTexts]>;
}

function entryTexts(entries: Record<string, unknown>, what: string): EntryTexts {
  const texts = new Map<string, string>();
  for (const key of Object.keys(entries)) {
    const json: string | undefined = JSON.stringify(entries[key]);
    // An entry without a value is no record: nothing is saved from such an index, so no file is taken for one whose record left.
    if (json === undefined) throw new TypeError(`The asset index holds no ${what} under "${key}"`);
    texts.set(key, json);
  }
  return texts;
}

export function snapshotIndex(metadata: AssetMetadata): IndexSnapshot {
  const assets = entryTexts(metadata.assets, 'asset');
  const collections = entryTexts(metadata.collections, 'collection');
  const fields: Array<readonly [string, string | EntryTexts]> = [];
  for (const [name, value] of Object.entries<unknown>({ ...metadata })) {
    if (name === 'assets') fields.push([name, assets]);
    else if (name === 'collections') fields.push([name, collections]);
    else {
      const json: string | undefined = JSON.stringify(value);
      if (json !== undefined) fields.push([name, json]);
    }
  }
  return { assets, collections, library: libraryFactsOf(metadata), fields };
}

function objectText(members: Iterable<readonly [string, string]>): string {
  return `{${Array.from(members, ([name, json]) => `${JSON.stringify(name)}:${json}`).join(',')}}`;
}

function fieldText(value: string | EntryTexts): string {
  return typeof value === 'string' ? value : objectText(value);
}

/**
 * The text `JSON.stringify` gives for the index a snapshot was taken of, with
 * the field `name` set to the value whose JSON is `json`.
 */
export function indexText(snapshot: IndexSnapshot, name: string, json: string): string {
  const members = snapshot.fields.map(([field, value]): readonly [string, string] => [
    field,
    field === name ? json : fieldText(value),
  ]);
  if (!snapshot.fields.some(([field]) => field === name)) members.push([name, json]);
  return objectText(members);
}
